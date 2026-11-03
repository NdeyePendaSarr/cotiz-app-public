import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Limite des essais de connexion (audit, lot 2 ; corrigée le 03/11/2026). Deux compteurs, sur
// FENETRE_MINUTES, et la connexion est refusée sans même interroger Supabase quand l'un déborde :
// - MAX_ECHECS échecs pour une même adresse DEPUIS UN MÊME RÉSEAU : quelqu'un d'autre, ailleurs,
//   ne peut plus bloquer la trésorière en tapant de faux mots de passe sur son adresse ;
// - MAX_ECHECS_RESEAU échecs d'un même réseau, toutes adresses confondues : un réseau ne peut pas
//   essayer adresse après adresse.
// Rien n'est stocké en clair : seulement des empreintes SHA-256 (adresse en minuscules, sans espaces).

export const MAX_ECHECS = 5;
export const MAX_ECHECS_RESEAU = 30;
export const FENETRE_MINUTES = 15;

export type Origine = { email: string; reseau: string };

const empreinte = (texte: string) => createHash("sha256").update(texte).digest("hex");
const normaliser = (email: string) => email.trim().toLowerCase();

/** Compteur d'une adresse depuis un réseau. */
export const cleCompte = ({ email, reseau }: Origine) => empreinte(`compte:${normaliser(email)}|reseau:${reseau}`);
/** Compteur d'un réseau, toutes adresses confondues. */
export const cleReseau = (reseau: string) => empreinte(`reseau:${reseau}`);

const debutFenetre = () => new Date(Date.now() - FENETRE_MINUTES * 60_000);
const echecsRecents = (cle: string) => prisma.tentativeConnexion.count({ where: { cle, createdAt: { gte: debutFenetre() } } });

/** Trop d'échecs récents pour cette adresse depuis ce réseau, ou pour ce réseau ? */
export async function connexionBloquee(origine: Origine) {
  const [compte, reseau] = await Promise.all([echecsRecents(cleCompte(origine)), echecsRecents(cleReseau(origine.reseau))]);
  return compte >= MAX_ECHECS || reseau >= MAX_ECHECS_RESEAU;
}

/** Note un échec dans les deux compteurs, et efface au passage les traces de plus d'un jour (la table reste minuscule). */
export async function noterEchec(origine: Origine) {
  await prisma.tentativeConnexion.createMany({ data: [{ cle: cleCompte(origine) }, { cle: cleReseau(origine.reseau) }] });
  await prisma.tentativeConnexion.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

/** Connexion réussie : le compteur de cette adresse depuis ce réseau repart de zéro (celui du réseau reste). */
export async function oublierEchecs(origine: Origine) {
  await prisma.tentativeConnexion.deleteMany({ where: { cle: cleCompte(origine) } });
}

/** Réseau d'origine d'une requête : première adresse de x-forwarded-for (posée par Vercel), sinon « inconnu ». */
export function reseauDepuisEntetes(entetes: Headers) {
  return entetes.get("x-forwarded-for")?.split(",")[0]?.trim() || entetes.get("x-real-ip")?.trim() || "inconnu";
}
