import "server-only";
import { prisma } from "@/lib/prisma";

// Sorties de caisse (phase 11) et bonnes volontés : toujours filtrées par l'ownerId de l'utilisatrice.

export function listerDepenses(ownerId: string, caisseId: string) {
  return prisma.depense.findMany({
    where: { ownerId, caisseId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, montant: true, motif: true, beneficiaire: true, canal: true, categorie: true },
  });
}

/** Dépense et sa caisse (pour la modification), null si elle n'est pas à l'utilisatrice. */
export function obtenirDepense(ownerId: string, id: string) {
  return prisma.depense.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      date: true,
      montant: true,
      motif: true,
      beneficiaire: true,
      canal: true,
      categorie: true,
      caisse: { select: { id: true, nom: true } },
    },
  });
}

export function listerDons(ownerId: string, caisseId: string) {
  return prisma.don.findMany({
    where: { ownerId, caisseId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, montant: true, donateur: true, remisPar: true, canal: true, note: true, paiementId: true },
  });
}

/** Bonne volonté et sa caisse (pour la modification), null si elle n'est pas à l'utilisatrice. */
export function obtenirDon(ownerId: string, id: string) {
  return prisma.don.findFirst({
    where: { id, ownerId },
    select: { id: true, date: true, montant: true, donateur: true, remisPar: true, canal: true, note: true, paiementId: true, caisse: { select: { id: true, nom: true } } },
  });
}

/** Cotisations encaissées par une caisse : allocations sur les échéances de tous ses cycles. */
export async function encaisseCaisse(ownerId: string, caisseId: string) {
  const r = await prisma.allocation.aggregate({
    where: { echeance: { cycle: { caisseId, caisse: { ownerId } } } },
    _sum: { montant: true },
  });
  return r._sum.montant ?? 0;
}
