import "server-only";
import { prisma } from "@/lib/prisma";

// Comptes gardés (COMPTE_GARDE) : toujours filtrés par l'ownerId de l'utilisatrice connectée.

const CHAMPS_MOUVEMENT = { id: true, date: true, montant: true, sens: true, canal: true, note: true, paiementId: true, createdAt: true } as const;

/**
 * Compte gardé, ses membres et tous ses mouvements (du plus récent au plus ancien), ou null.
 * Pour une personne : le titulaire est le premier inscrit. Pour une organisation : ce sont ses contacts.
 */
export function obtenirCompte(ownerId: string, caisseId: string) {
  return prisma.caisse.findFirst({
    where: { id: caisseId, ownerId, type: "COMPTE_GARDE" },
    select: {
      id: true,
      nom: true,
      statut: true,
      createdAt: true,
      organisation: true,
      // Ordre stable : le premier inscrit est le titulaire d'un compte pour une personne.
      membres: {
        orderBy: [{ dateEntree: "asc" }, { id: "asc" }],
        select: { id: true, statut: true, personne: { select: { id: true, nomComplet: true, numeros: { select: { numero: true } } } } },
      },
      mouvements: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: CHAMPS_MOUVEMENT },
    },
  });
}

/** Un mouvement et son compte (pour la modification), ou null. */
export function obtenirMouvement(ownerId: string, id: string) {
  return prisma.mouvementCompte.findFirst({
    where: { id, ownerId },
    select: { ...CHAMPS_MOUVEMENT, caisse: { select: { id: true, nom: true, statut: true } } },
  });
}

/**
 * Comptes gardés actifs de chaque personne (rapprochement : un SMS de son numéro peut être versé
 * sur son compte au lieu d'une échéance). Un contact d'une organisation voit le compte de celle-ci ;
 * un contact retiré, non.
 */
export async function comptesParPersonne(ownerId: string): Promise<Record<string, { id: string; nom: string }[]>> {
  const membres = await prisma.membreCaisse.findMany({
    where: { statut: "ACTIF", caisse: { ownerId, type: "COMPTE_GARDE", statut: "ACTIVE" } },
    select: { personneId: true, caisse: { select: { id: true, nom: true, organisation: true } } },
  });
  const parPersonne: Record<string, { id: string; nom: string }[]> = {};
  for (const { personneId, caisse: c } of membres) (parPersonne[personneId] ??= []).push({ id: c.id, nom: c.organisation ? `${c.nom} (${c.organisation})` : c.nom });
  return parPersonne;
}

/** Solde et titulaire (personne ou organisation) de chaque compte gardé (liste des caisses, fiche personne). */
export async function resumesComptes(ownerId: string): Promise<Map<string, { solde: number; titulaire: string | null }>> {
  const [lignes, comptes] = await Promise.all([
    prisma.mouvementCompte.groupBy({ by: ["caisseId", "sens"], where: { ownerId }, _sum: { montant: true } }),
    prisma.caisse.findMany({ where: { ownerId, type: "COMPTE_GARDE" }, select: { id: true, organisation: true, membres: { take: 1, orderBy: [{ dateEntree: "asc" }, { id: "asc" }], select: { personne: { select: { nomComplet: true } } } } } }),
  ]);
  const resumes = new Map(comptes.map((c) => [c.id, { solde: 0, titulaire: c.organisation ?? c.membres[0]?.personne.nomComplet ?? null }]));
  for (const l of lignes) {
    const r = resumes.get(l.caisseId);
    if (r) r.solde += (l.sens === "VERSEMENT" ? 1 : -1) * (l._sum.montant ?? 0);
  }
  return resumes;
}
