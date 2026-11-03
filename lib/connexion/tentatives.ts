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

/** Début du blocage en cours pour ce compteur, ou null. */
async function blocageEnCours(cle: string, maintenant: Date) {
  const blocage = await prisma.tentativeConnexion.findFirst({
    where: { cle: cleBlocage(cle), createdAt: { gt: new Date(maintenant.getTime() - DUREE) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return blocage?.createdAt ?? null;
}

/** Bloquée ? Renvoie les minutes restantes (le plus long des deux compteurs), ou null. */
export async function connexionBloquee(origine: Origine, maintenant = new Date()): Promise<number | null> {
  const debuts = (await Promise.all(compteurs(origine).map((c) => blocageEnCours(c.cle, maintenant)))).filter((d): d is Date => d !== null);
  if (debuts.length === 0) return null;
  return Math.max(...debuts.map((d) => minutesRestantes(d, maintenant)));
}

/**
 * Note un échec dans les deux compteurs. Si l'un déborde (échecs depuis DUREE_BLOCAGE_MINUTES et
 * depuis la fin du dernier blocage), le blocage commence maintenant : renvoie ses minutes, sinon null.
 */
export async function noterEchec(origine: Origine, maintenant = new Date()): Promise<number | null> {
  let bloque = false;
  for (const { cle, max } of compteurs(origine)) {
    await prisma.tentativeConnexion.create({ data: { cle, createdAt: maintenant } });
    const dernierBlocage = await prisma.tentativeConnexion.findFirst({ where: { cle: cleBlocage(cle) }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const finDernierBlocage = dernierBlocage ? dernierBlocage.createdAt.getTime() + DUREE : 0;
    const depuis = new Date(Math.max(maintenant.getTime() - DUREE, finDernierBlocage));
    const echecs = await prisma.tentativeConnexion.count({ where: { cle, createdAt: { gte: depuis } } });
    if (echecs >= max) {
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

/** Réseau d'origine d'une requête : première adresse de x-forwarded-for (posée par Vercel), sinon « inconnu ». */
export function reseauDepuisEntetes(entetes: Headers) {
  return entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip")?.trim() || "inconnu";
}
