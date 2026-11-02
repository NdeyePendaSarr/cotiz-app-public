// Bonnes volontés : règles pures (testées) autour de l'excédent d'un paiement.

/** Ce qui reste d'un paiement après les cotisations et la bonne volonté éventuelle : à rembourser. */
export function excedentPaiement(montant: number, allocations: { montant: number }[], don?: { montant: number } | null) {
  return montant - allocations.reduce((s, a) => s + a.montant, 0) - (don?.montant ?? 0);
}

type CaisseAllocation = { id: string; nom: string; type: "TONTINE" | "COLLECTE"; statut: "ACTIVE" | "ARCHIVEE" };

/**
 * Collecte où l'excédent d'un paiement peut devenir une bonne volonté : celle de ses cotisations,
 * si elles vont toutes à une seule collecte active. Sinon (tontine, plusieurs caisses, aucune
 * cotisation) : null, l'excédent reste à rembourser.
 */
export function collecteDuDon(allocations: { echeance: { cycle: { caisse: CaisseAllocation } } }[]) {
  const caisses = new Map(allocations.map((a) => [a.echeance.cycle.caisse.id, a.echeance.cycle.caisse]));
  if (caisses.size !== 1) return null;
  const [caisse] = caisses.values();
  return caisse.type === "COLLECTE" && caisse.statut === "ACTIVE" ? { id: caisse.id, nom: caisse.nom } : null;
}
