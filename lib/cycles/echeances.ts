import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { montantDuParMembre } from "@/lib/mensualite";

// Création et retrait des échéances. Toujours appelées DANS une transaction, avec une caisse
// dont l'appartenance à l'utilisatrice a déjà été vérifiée par l'appelant.

type Tx = Prisma.TransactionClient;

/** Une échéance par membre actif de la caisse, au montant actuel de la cotisation. */
export async function creerEcheancesDuCycle(tx: Tx, cycleId: string, caisseId: string, montantDu: number) {
  const membres = await tx.membreCaisse.findMany({ where: { caisseId, statut: "ACTIF" }, select: { id: true } });
  const { count } = await tx.echeance.createMany({
    data: membres.map((m) => ({ cycleId, membreCaisseId: m.id, montantDu })),
    skipDuplicates: true, // contrainte unique (cycle, membre) : jamais deux échéances
  });
  return count;
}

/** Membre ajouté, importé ou réactivé : échéance dans le cycle ouvert de sa caisse, s'il y en a un. */
export async function assurerEcheanceMembre(tx: Tx, membreCaisseId: string, caisseId: string) {
  const cycle = await tx.cycle.findFirst({
    where: { caisseId, statut: "OUVERT" },
    select: { id: true, caisse: { select: { type: true, montantCotisation: true, nombreMois: true } } },
  });
  if (!cycle) return;
  // Mensualité : toute la durée, même pour qui arrive en cours d'année (règle de la trésorière).
  await tx.echeance.createMany({
    data: [{ cycleId: cycle.id, membreCaisseId, montantDu: montantDuParMembre(cycle.caisse) }],
    skipDuplicates: true,
  });
}

/**
 * Membre retiré : son échéance du cycle ouvert est supprimée si aucun paiement n'y est alloué,
 * gardée sinon (l'argent reçu doit rester tracé).
 */
export async function retirerEcheanceMembre(tx: Tx, membreCaisseId: string) {
  await tx.echeance.deleteMany({
    where: { membreCaisseId, cycle: { statut: "OUVERT" }, allocations: { none: {} } },
  });
}
