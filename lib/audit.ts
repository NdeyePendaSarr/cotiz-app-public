import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

// Journal d'audit (cahier) : chaque création ou modification de Paiement et d'Allocation
// écrit une ligne, DANS la même transaction que la modification elle-même. Si la
// transaction échoue, la ligne de journal disparaît avec elle : le journal ne ment jamais.

// Audit, lot 2 : aussi la clôture d'un cycle, la modification d'une caisse ou d'une personne
// (numéros remplacés) et le retrait / la réactivation d'un membre (échéance retirée ou recréée).
export type EntiteJournal = "Paiement" | "Allocation" | "SmsNonLu" | "Depense" | "Don" | "Cycle" | "Caisse" | "Personne" | "MembreCaisse" | "MouvementCompte";
export type ActionJournal = "CREATION" | "COMPLETION" | "MODIFICATION" | "SUPPRESSION" | "TRAITEMENT";

export async function journaliser(
  tx: Prisma.TransactionClient,
  ligne: { ownerId: string; entite: EntiteJournal; entiteId: string; action: ActionJournal; details?: Prisma.InputJsonValue },
) {
  await tx.journalAudit.create({ data: ligne });
}
