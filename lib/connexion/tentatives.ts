import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Limite des essais de connexion (audit, lot 2) : au-delà de MAX_ECHECS échecs en FENETRE_MINUTES
// pour une même adresse, la connexion est refusée un moment, sans même interroger Supabase.
// L'adresse n'est jamais stockée en clair : seulement son empreinte SHA-256 (minuscules, sans espaces).

export const MAX_ECHECS = 5;
export const FENETRE_MINUTES = 15;

export const cleConnexion = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

const debutFenetre = () => new Date(Date.now() - FENETRE_MINUTES * 60_000);

/** Trop d'échecs récents pour cette adresse ? */
export async function connexionBloquee(email: string) {
  const echecs = await prisma.tentativeConnexion.count({ where: { cle: cleConnexion(email), createdAt: { gte: debutFenetre() } } });
  return echecs >= MAX_ECHECS;
}

/** Note un échec, et efface au passage les traces de plus d'un jour (la table reste minuscule). */
export async function noterEchec(email: string) {
  await prisma.tentativeConnexion.create({ data: { cle: cleConnexion(email) } });
  await prisma.tentativeConnexion.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

/** Connexion réussie : le compteur de cette adresse repart de zéro. */
export async function oublierEchecs(email: string) {
  await prisma.tentativeConnexion.deleteMany({ where: { cle: cleConnexion(email) } });
}
