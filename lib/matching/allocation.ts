// Étape 2 du rapprochement (cahier) : répartir un paiement sur les échéances de la personne.
// Fonction pure (aucune base) : utilisée côté serveur ET dans le navigateur pour recalculer
// la proposition quand la trésorière choisit une autre personne. Le serveur revérifie tout.

import { formaterFCFA } from "@/lib/format";

export type EcheanceDue = {
  id: string;
  caisseNom: string;
  cycleNumero: number;
  dateEcheance: string; // AAAA-MM-JJ
  montantDu: number;
  dejaAlloue: number;
  /** Échéance d'un membre retiré : il peut encore payer, mais jamais sans décision (pas « sûr »). */
  membreRetire?: boolean;
};

export type Ligne = { echeanceId: string; montant: number };

export type Repartition = {
  lignes: Ligne[];
  excedent: number; // « à rembourser » : jamais avancé sur un cycle suivant
};

export type Proposition = {
  type: "exacte" | "combinaison" | "plus_anciennes" | "aucune_echeance";
  principale: Repartition;
  /** Autres possibilités aussi bonnes (même montant, caisses ou cycles différents). */
  alternatives: Repartition[];
};

export const MAX_ALTERNATIVES = 3;
const MAX_ECHEANCES_COMBINAISON = 12; // 2^12 = 4 096 combinaisons : instantané

export const restant = (e: EcheanceDue) => e.montantDu - e.dejaAlloue;

/** Plus ancienne d'abord ; à date égale, ordre alphabétique de la caisse (résultat stable). */
export function trierEcheances(echeances: EcheanceDue[]) {
  return echeances
    .filter((e) => restant(e) > 0)
    .sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance) || a.caisseNom.localeCompare(b.caisseNom) || a.cycleNumero - b.cycleNumero);
}

const repartition = (montant: number, choisies: EcheanceDue[]): Repartition => {
  const lignes = choisies.map((e) => ({ echeanceId: e.id, montant: restant(e) }));
  return { lignes, excedent: montant - lignes.reduce((s, l) => s + l.montant, 0) };
};

/**
 * 1. Une échéance dont le reste dû = le montant → elle (les autres équivalentes en alternatives).
 * 2. Sinon, plusieurs échéances dont la somme = le montant (2 caisses, 2 cycles) → la combinaison
 *    la plus ancienne (les autres en alternatives).
 * 3. Sinon, remplir les plus anciennes d'abord ; le reste est un paiement partiel, le surplus
 *    un excédent « à rembourser ». Une ligne ne dépasse jamais ce qui reste dû.
 */
export function proposerRepartition(montant: number, echeancesDues: EcheanceDue[]): Proposition {
  const echeances = trierEcheances(echeancesDues);
  if (echeances.length === 0) return { type: "aucune_echeance", principale: { lignes: [], excedent: montant }, alternatives: [] };

  const exactes = echeances.filter((e) => restant(e) === montant);
  if (exactes.length > 0) {
    const [premiere, ...autres] = exactes.map((e) => repartition(montant, [e]));
    return { type: "exacte", principale: premiere, alternatives: autres.slice(0, MAX_ALTERNATIVES) };
  }

  const combinaisons = chercherCombinaisons(montant, echeances.slice(0, MAX_ECHEANCES_COMBINAISON));
  if (combinaisons.length > 0) {
    const [premiere, ...autres] = combinaisons.map((c) => repartition(montant, c));
    return { type: "combinaison", principale: premiere, alternatives: autres.slice(0, MAX_ALTERNATIVES) };
  }

  const lignes: Ligne[] = [];
  let reste = montant;
  for (const e of echeances) {
    if (reste <= 0) break;
    const part = Math.min(restant(e), reste);
    lignes.push({ echeanceId: e.id, montant: part });
    reste -= part;
  }
  return { type: "plus_anciennes", principale: { lignes, excedent: reste }, alternatives: [] };
}

/**
 * Toutes les combinaisons de 2 échéances ou plus dont la somme des restes = montant, triées
 * de la plus ancienne à la plus récente (on compare les positions dans la liste triée).
 */
function chercherCombinaisons(montant: number, echeances: EcheanceDue[]): EcheanceDue[][] {
  const trouvees: number[][] = [];
  const n = echeances.length;
  for (let masque = 1; masque < 1 << n; masque++) {
    const positions: number[] = [];
    let somme = 0;
    for (let i = 0; i < n; i++) {
      if (masque & (1 << i)) {
        positions.push(i);
        somme += restant(echeances[i]);
      }
    }
    if (positions.length >= 2 && somme === montant) trouvees.push(positions);
  }
  trouvees.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return trouvees.map((positions) => positions.map((i) => echeances[i]));
}

/** Contrôle d'une répartition saisie (aussi refait côté serveur avant d'écrire). */
export function verifierRepartition(montant: number, lignes: Ligne[], echeancesDues: EcheanceDue[]): string | null {
  const parId = new Map(echeancesDues.map((e) => [e.id, e]));
  let total = 0;
  for (const l of lignes) {
    const e = parId.get(l.echeanceId);
    if (!e) return "Échéance introuvable pour cette personne.";
    if (!Number.isInteger(l.montant) || l.montant <= 0) return "Chaque montant doit être un entier positif.";
    if (l.montant > restant(e)) return `${e.caisseNom}, cycle ${e.cycleNumero} : maximum ${formaterFCFA(restant(e))} (reste dû).`;
    total += l.montant;
  }
  if (new Set(lignes.map((l) => l.echeanceId)).size !== lignes.length) return "Une échéance apparaît deux fois.";
  if (total > montant) return "La répartition dépasse le montant du paiement.";
  return null;
}
