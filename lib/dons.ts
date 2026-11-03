import { avecDepenses } from "@/lib/depenses";
import type { TypeCaisse } from "@/lib/generated/prisma/enums";

// Bonnes volontés : règles pures (testées) autour de l'excédent d'un paiement.

/**
 * Ce qui reste d'un paiement après les cotisations, la bonne volonté éventuelle et le versement sur
 * un compte gardé (tout le paiement) : à rembourser.
 */
export function excedentPaiement(montant: number, allocations: { montant: number }[], don?: { montant: number } | null, mouvementCompte?: { montant: number } | null) {
  return montant - allocations.reduce((s, a) => s + a.montant, 0) - (don?.montant ?? 0) - (mouvementCompte?.montant ?? 0);
}

type CaisseAllocation = { id: string; nom: string; type: TypeCaisse; statut: "ACTIVE" | "ARCHIVEE" };

/**
 * Collecte où l'excédent d'un paiement peut devenir une bonne volonté : celle de ses cotisations,
 * si elles vont toutes à une seule collecte active. Sinon (tontine, plusieurs caisses, aucune
 * cotisation) : null, l'excédent reste à rembourser.
 */
export function collecteDuDon(allocations: { echeance: { cycle: { caisse: CaisseAllocation } } }[]) {
  const caisses = new Map(allocations.map((a) => [a.echeance.cycle.caisse.id, a.echeance.cycle.caisse]));
  if (caisses.size !== 1) return null;
  const [caisse] = caisses.values();
  return avecDepenses(caisse.type) && caisse.statut === "ACTIVE" ? { id: caisse.id, nom: caisse.nom } : null;
}
