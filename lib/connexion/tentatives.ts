import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Limite des essais de connexion (audit, lot 2 ; corrigée les 03/11/2026). Deux compteurs :
// - MAX_ECHECS échecs pour une même adresse DEPUIS UN MÊME RÉSEAU : quelqu'un d'autre, ailleurs,
//   ne peut pas bloquer la trésorière en tapant de faux mots de passe sur son adresse ;
// - MAX_ECHECS_RESEAU échecs d'un même réseau, toutes adresses confondues.
// Le blocage (demande de la trésorière) : il commence à l'échec qui fait déborder le compteur et dure
// DUREE_BLOCAGE_MINUTES à partir de cet instant ; les essais pendant le blocage ne le prolongent pas,
// et chacun affiche les minutes restantes. Après le blocage, le compteur repart de zéro.
// Rien n'est stocké en clair : seulement des empreintes SHA-256 (table tentatives_connexion : une ligne
// par échec, et une ligne « blocage » quand un compteur déborde).

export const MAX_ECHECS = 5;
export const MAX_ECHECS_RESEAU = 30;
export const DUREE_BLOCAGE_MINUTES = 10;

export type Origine = { email: string; reseau: string };

const MINUTE = 60_000;
const DUREE = DUREE_BLOCAGE_MINUTES * MINUTE;

const empreinte = (texte: string) => createHash("sha256").update(texte).digest("hex");
const normaliser = (email: string) => email.trim().toLowerCase();

/** Compteur d'une adresse depuis un réseau. */
export const cleCompte = ({ email, reseau }: Origine) => empreinte(`compte:${normaliser(email)}|reseau:${reseau}`);
/** Compteur d'un réseau, toutes adresses confondues. */
export const cleReseau = (reseau: string) => empreinte(`reseau:${reseau}`);
/** Ligne qui marque le début d'un blocage pour un compteur. */
export const cleBlocage = (cle: string) => empreinte(`blocage:${cle}`);

const compteurs = (origine: Origine) => [
  { cle: cleCompte(origine), max: MAX_ECHECS },
  { cle: cleReseau(origine.reseau), max: MAX_ECHECS_RESEAU },
];

/** Minutes restantes avant la fin d'un blocage commencé à `debut` (au moins 1). */
export function minutesRestantes(debut: Date, maintenant = new Date()) {
  return Math.max(1, Math.ceil((debut.getTime() + DUREE - maintenant.getTime()) / MINUTE));
}

/** « Trop d'essais. Réessaie dans 9 minutes. » */
export function messageBlocage(minutes: number) {
  return `Trop d'essais. Réessaie dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

type Client = Pick<typeof prisma, "tentativeConnexion">;

/** Début du blocage en cours pour ce compteur, ou null. */
async function blocageEnCours(client: Client, cle: string, maintenant: Date) {
  const blocage = await client.tentativeConnexion.findFirst({
    where: { cle: cleBlocage(cle), createdAt: { gt: new Date(maintenant.getTime() - DUREE) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return blocage?.createdAt ?? null;
}

async function minutesDeBlocage(client: Client, origine: Origine, maintenant: Date): Promise<number | null> {
  const debuts: Date[] = [];
  for (const { cle } of compteurs(origine)) {
    const debut = await blocageEnCours(client, cle, maintenant);
    if (debut) debuts.push(debut);
  }
  if (debuts.length === 0) return null;
  return Math.max(...debuts.map((d) => minutesRestantes(d, maintenant)));
}

/** Bloquée ? Renvoie les minutes restantes (le plus long des deux compteurs), ou null. */
export function connexionBloquee(origine: Origine, maintenant = new Date()): Promise<number | null> {
  return minutesDeBlocage(prisma, origine, maintenant);
}

/** Échecs (ou essais en cours) de ce compteur depuis DUREE_BLOCAGE_MINUTES et depuis la fin du dernier blocage. */
async function compterEchecs(client: Client, cle: string, maintenant: Date) {
  const dernierBlocage = await client.tentativeConnexion.findFirst({ where: { cle: cleBlocage(cle) }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const finDernierBlocage = dernierBlocage ? dernierBlocage.createdAt.getTime() + DUREE : 0;
  const depuis = new Date(Math.max(maintenant.getTime() - DUREE, finDernierBlocage));
  return client.tentativeConnexion.count({ where: { cle, createdAt: { gte: depuis } } });
}

export type Reservation = { bloque: number } | { essai: bigint[] };

/**
 * À appeler AVANT d'interroger Supabase : réserve l'essai dans les deux compteurs, sous verrou, comme
 * s'il allait échouer. Des requêtes simultanées ne passent donc pas toutes avant le blocage : au-delà
 * du maximum, les suivantes sont refusées. Un refus renvoie les minutes à attendre : celles du blocage
 * en cours, ou 1 si seuls des essais en cours remplissent le compteur (leur sort se joue tout de suite).
 * Ensuite : confirmerEchec si le mot de passe est faux, annulerEssai sinon.
 */
export async function reserverEssai(origine: Origine, maintenant = new Date()): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    // Verrou de transaction par compteur, toujours dans le même ordre (compte, puis réseau).
    for (const { cle } of compteurs(origine)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cle}::text, 0))`;
    const restantes = await minutesDeBlocage(tx, origine, maintenant);
    if (restantes !== null) return { bloque: restantes };

    for (const { cle, max } of compteurs(origine)) {
      if ((await compterEchecs(tx, cle, maintenant)) >= max) return { bloque: 1 };
    }
    const essai: bigint[] = [];
    for (const { cle } of compteurs(origine)) essai.push((await tx.tentativeConnexion.create({ data: { cle, createdAt: maintenant }, select: { id: true } })).id);
    return { essai };
  });
}

/** L'essai réservé n'était pas un mauvais mot de passe (réussite, panne de Supabase) : il ne compte pas. */
export async function annulerEssai(essai: bigint[]) {
  await prisma.tentativeConnexion.deleteMany({ where: { id: { in: essai } } });
}

/**
 * Le mot de passe était faux : l'essai réservé reste compté. Si un compteur déborde, le blocage commence
 * maintenant : renvoie ses minutes, sinon null. Un échec tardif pendant un blocage ne le prolonge pas.
 */
export async function confirmerEchec(origine: Origine, maintenant = new Date()): Promise<number | null> {
  let bloque = false;
  for (const { cle, max } of compteurs(origine)) {
    if ((await compterEchecs(prisma, cle, maintenant)) >= max) {
      await prisma.tentativeConnexion.create({ data: { cle: cleBlocage(cle), createdAt: maintenant } });
      bloque = true;
    }
  }
  // Ménage : les traces de plus d'un jour (la table reste minuscule).
  await prisma.tentativeConnexion.deleteMany({ where: { createdAt: { lt: new Date(maintenant.getTime() - 86_400_000) } } });
  return bloque ? DUREE_BLOCAGE_MINUTES : null;
}

/** Connexion réussie : le compteur de cette adresse depuis ce réseau repart de zéro (celui du réseau reste). */
export async function oublierEchecs(origine: Origine) {
  const cle = cleCompte(origine);
  await prisma.tentativeConnexion.deleteMany({ where: { cle: { in: [cle, cleBlocage(cle)] } } });
}

/**
 * Réseau d'une adresse IP. IPv4 : l'adresse. IPv6 : son préfixe /64, car un même abonné dispose de
 * milliards d'adresses dans ce bloc (changer d'adresse ne doit pas remettre le compteur à zéro).
 */
export function reseauDeLAdresse(adresse: string) {
  const ip = adresse.split("%")[0].toLowerCase();
  if (!ip.includes(":")) return ip;
  const ipv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (ipv4) return ipv4[1];
  const [debut, fin] = ip.split("::");
  const gauche = debut ? debut.split(":") : [];
  const droite = fin ? fin.split(":") : [];
  const groupes = ip.includes("::") ? [...gauche, ...Array<string>(Math.max(0, 8 - gauche.length - droite.length)).fill("0"), ...droite] : gauche;
  if (groupes.length !== 8 || !groupes.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groupes.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/** Réseau d'origine d'une requête : première adresse de x-forwarded-for (posée par Vercel), sinon « inconnu ». */
export function reseauDepuisEntetes(entetes: Headers) {
  const adresse = entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip")?.trim();
  return adresse ? reseauDeLAdresse(adresse) : "inconnu";
}
