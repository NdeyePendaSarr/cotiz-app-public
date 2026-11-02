// Historique d'une caisse (lot 4) : pour chaque membre, l'état de son échéance à chaque cycle.
// Pur (aucune base), testé. Pas de notion de retard (choix de la trésorière) : seulement payé,
// partiel, non payé (cycle clôturé) ou en attente (cycle ouvert).

export type EtatCase = "PAYE" | "PARTIEL" | "NON_PAYE" | "EN_ATTENTE" | "ABSENT";

export function etatCase(montantDu: number, paye: number, cycleOuvert: boolean): Exclude<EtatCase, "ABSENT"> {
  if (paye >= montantDu) return "PAYE";
  if (paye > 0) return "PARTIEL";
  return cycleOuvert ? "EN_ATTENTE" : "NON_PAYE";
}

export const LIBELLES_ETAT_CASE: Record<EtatCase, string> = {
  PAYE: "Payé",
  PARTIEL: "Partiel",
  NON_PAYE: "Non payé",
  EN_ATTENTE: "En attente",
  ABSENT: "Pas membre",
};

export type EntreeHistorique = {
  ligneId: string;
  libelle: string;
  /** Ordre d'affichage (ordre de passage) ; null en dernier. */
  ordre: number | null;
  actif: boolean;
  cycleNumero: number;
  cycleOuvert: boolean;
  montantDu: number;
  paye: number;
};

export type LigneHistorique = { ligneId: string; libelle: string; actif: boolean; cases: EtatCase[]; payes: number; echeances: number };

/** Nombre de cycles affichés au plus (les plus récents). */
export const MAX_CYCLES_HISTORIQUE = 12;

/**
 * Tableau lignes × cycles, cycles du plus ancien au plus récent (les 12 derniers). Une ligne par
 * membre, triée par ordre de passage puis nom ; les membres inactifs après les actifs.
 */
export function construireHistorique(entrees: EntreeHistorique[], max = MAX_CYCLES_HISTORIQUE) {
  const cycles = [...new Set(entrees.map((e) => e.cycleNumero))].sort((a, b) => a - b).slice(-max);
  const colonne = new Map(cycles.map((n, i) => [n, i]));
  const ouverts = new Set(entrees.filter((e) => e.cycleOuvert).map((e) => e.cycleNumero));

  const lignes = new Map<string, LigneHistorique & { ordre: number | null }>();
  for (const e of entrees) {
    const i = colonne.get(e.cycleNumero);
    if (i === undefined) continue;
    const l = lignes.get(e.ligneId) ?? {
      ligneId: e.ligneId,
      libelle: e.libelle,
      ordre: e.ordre,
      actif: e.actif,
      cases: cycles.map((): EtatCase => "ABSENT"),
      payes: 0,
      echeances: 0,
    };
    l.cases[i] = etatCase(e.montantDu, e.paye, e.cycleOuvert);
    if (!e.cycleOuvert) {
      l.echeances++;
      if (l.cases[i] === "PAYE") l.payes++;
    }
    lignes.set(e.ligneId, l);
  }

  const triees = [...lignes.values()].sort(
    (a, b) => Number(b.actif) - Number(a.actif) || (a.ordre ?? Infinity) - (b.ordre ?? Infinity) || a.libelle.localeCompare(b.libelle, "fr"),
  );
  // L'ordre ne sert qu'au tri : il n'est pas renvoyé.
  return { cycles, ouverts, lignes: triees.map((l) => ({ ligneId: l.ligneId, libelle: l.libelle, actif: l.actif, cases: l.cases, payes: l.payes, echeances: l.echeances })) };
}
