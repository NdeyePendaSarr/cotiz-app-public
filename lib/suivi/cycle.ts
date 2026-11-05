// Suivi d'un cycle (page d'une caisse) : statut de chaque membre, totaux, arriérés, récap.
// Fonctions pures, testées : aucune base, aucune date « maintenant » cachée (passée en paramètre).

import { statutEcheance, type StatutEcheance } from "@/lib/echeances/statut";
import { formaterDate, formaterFCFA } from "@/lib/format";

export type EcheanceSuivie = {
  membreId: string;
  personneId: string;
  nom: string;
  ordre: number | null;
  membreActif: boolean;
  numeros: string[];
  /** Cellule de la commission (phase 10), null si non renseignée. */
  cellule?: string | null;
  montantDu: number;
  paye: number; // somme des allocations
  /** Reste dû sur les cycles clôturés de cette caisse (hors cycle en cours). */
  arriere: number;
  /**
   * Mensualité : dû à ce jour (mois écoulés et mois en cours) et dû des mois terminés. « À jour »,
   * reste et relance portent alors sur ce qui est dû à ce jour, pas sur toute la durée.
   */
  exigible?: number;
  echu?: number;
};

export type LigneSuivi = EcheanceSuivie & { reste: number; statut: StatutEcheance; aJour: boolean; enRetard: boolean };

export type Suivi = {
  actifs: LigneSuivi[];
  retires: LigneSuivi[];
  totaux: { attendu: number; recu: number; reste: number; payes: number; partiels: number; enAttente: number; membres: number };
  /** Arriérés de la caisse, affichés à part (hors totaux du cycle). */
  totalArrieres: number;
};

/**
 * Situation d'un membre sur une échéance : la seule règle de « à jour », reste et statut.
 * Mensualité : ce qui est dû à ce jour (exigible), pas toute la durée.
 * Membre retiré : son reste ne compte plus (ni dû, ni relance, ni récap) ; ce qu'il a versé, si.
 */
export function situationEcheance(e: { montantDu: number; paye: number; exigible?: number; membreActif: boolean }) {
  if (!e.membreActif) return { statut: statutEcheance(e.montantDu, e.paye), reste: 0, aJour: true };
  const du = e.exigible ?? e.montantDu;
  const statut: StatutEcheance = du === 0 ? (e.paye > 0 ? "PAYE" : "A_VENIR") : statutEcheance(du, e.paye);
  return { statut, reste: Math.max(0, du - e.paye), aJour: statut === "PAYE" || statut === "A_VENIR" };
}

/** Attendu d'une échéance : le montant dû, ou seulement ce qu'a versé un membre retiré. */
const attenduDe = (e: { montantDu: number; paye: number; membreActif: boolean }) => (e.membreActif ? e.montantDu : Math.min(e.paye, e.montantDu));

/**
 * aujourdhui : date du jour à Dakar (minuit UTC), pour « en retard » après l'échéance.
 * totalArrieres : arriérés de toute la caisse, y compris ceux d'un membre retiré depuis, qui n'a plus
 * de ligne sur ce cycle (par défaut, la somme des lignes).
 */
export function calculerSuivi(echeances: EcheanceSuivie[], dateEcheance: Date, aujourdhui: Date, totalArrieres?: number): Suivi {
  const lignes: LigneSuivi[] = echeances.map((e) => {
    const situation = situationEcheance(e);
    const enRetard = !e.membreActif ? false : e.echu !== undefined ? e.paye < e.echu : !situation.aJour && aujourdhui > dateEcheance;
    return { ...e, ...situation, enRetard };
  });
  const actifs = lignes.filter((l) => l.membreActif);
  const compte = (s: StatutEcheance) => actifs.filter((l) => l.statut === s).length;
  const attendu = lignes.reduce((s, l) => s + attenduDe(l), 0);
  const recu = lignes.reduce((s, l) => s + Math.min(l.paye, l.montantDu), 0);
  return {
    actifs,
    retires: lignes.filter((l) => !l.membreActif),
    totaux: { attendu, recu, reste: attendu - recu, payes: actifs.filter((l) => l.aJour).length, partiels: compte("PARTIEL"), enAttente: compte("EN_ATTENTE"), membres: actifs.length },
    totalArrieres: totalArrieres ?? echeances.reduce((s, e) => s + e.arriere, 0),
  };
}

/**
 * Résumé d'un cycle ouvert pour le tableau de bord : reçu sur attendu (même calcul que
 * calculerSuivi : un trop-perçu ne compte pas), membres actifs et pas à jour, échéance passée.
 */
export function resumerCycle(echeances: { montantDu: number; paye: number; exigible?: number; membreActif: boolean }[], dateEcheance: Date, aujourdhui: Date) {
  const attendu = echeances.reduce((s, e) => s + attenduDe(e), 0);
  const recu = echeances.reduce((s, e) => s + Math.min(e.paye, e.montantDu), 0);
  const pasAJour = echeances.filter((e) => !situationEcheance(e).aJour).length;
  return { attendu, recu, membres: echeances.filter((e) => e.membreActif).length, pasAJour, echeancePassee: aujourdhui > dateEcheance };
}

export const CRITERES_TRI = { ordre: "Ordre de passage", statut: "Statut", nom: "Nom", reste: "Reste dû", cellule: "Cellule", verse: "Versé" } as const;
export type CritereTri = keyof typeof CRITERES_TRI;

const RANG_STATUT: Record<StatutEcheance, number> = { EN_ATTENTE: 0, PARTIEL: 1, PAYE: 2, A_VENIR: 3 };
const parNom = (a: LigneSuivi, b: LigneSuivi) => a.nom.localeCompare(b.nom, "fr");
const parOrdre = (a: LigneSuivi, b: LigneSuivi) => (a.ordre ?? Infinity) - (b.ordre ?? Infinity) || parNom(a, b);

/** Tri de la liste : sans ordre en dernier ; statut = d'abord ceux qui n'ont rien versé. */
export function trierSuivi(lignes: LigneSuivi[], critere: CritereTri) {
  const comparer = {
    ordre: parOrdre,
    nom: parNom,
    statut: (a: LigneSuivi, b: LigneSuivi) => RANG_STATUT[a.statut] - RANG_STATUT[b.statut] || parOrdre(a, b),
    reste: (a: LigneSuivi, b: LigneSuivi) => b.reste - a.reste || parOrdre(a, b),
    // Sans cellule en dernier (les colonnes du tableau, version ordinateur).
    cellule: (a: LigneSuivi, b: LigneSuivi) =>
      Number(!a.cellule) - Number(!b.cellule) || (a.cellule ?? "").localeCompare(b.cellule ?? "", "fr") || parNom(a, b),
    verse: (a: LigneSuivi, b: LigneSuivi) => b.paye - a.paye || parOrdre(a, b),
  }[critere];
  return [...lignes].sort(comparer);
}

// ─── Par cellule (phase 10) ──────────────────────────────────────────────────

export const SANS_CELLULE = "Sans cellule";

export type TotauxCellule = { cellule: string; membres: number; payes: number; attendu: number; recu: number };

/** Cellules présentes dans le cycle, par ordre alphabétique (« Sans cellule » en dernier). */
export function cellulesDu(lignes: LigneSuivi[]) {
  const noms = [...new Set(lignes.map((l) => l.cellule || SANS_CELLULE))];
  return noms.sort((a, b) => (a === SANS_CELLULE ? 1 : b === SANS_CELLULE ? -1 : a.localeCompare(b, "fr")));
}

/** Totaux de chaque cellule, calculés comme ceux du cycle (un trop-perçu ne compte pas). Vide si aucune cellule n'est renseignée. */
export function totauxParCellule(suivi: Suivi): TotauxCellule[] {
  const lignes = [...suivi.actifs, ...suivi.retires];
  if (!lignes.some((l) => l.cellule)) return [];
  return cellulesDu(lignes).map((cellule) => {
    const siennes = lignes.filter((l) => (l.cellule || SANS_CELLULE) === cellule);
    const actifs = siennes.filter((l) => l.membreActif);
    return {
      cellule,
      membres: actifs.length,
      payes: actifs.filter((l) => l.aJour).length,
      attendu: siennes.reduce((s, l) => s + attenduDe(l), 0),
      recu: siennes.reduce((s, l) => s + Math.min(l.paye, l.montantDu), 0),
    };
  });
}

// ─── Récap à coller dans le groupe WhatsApp ──────────────────────────────────

export type FormatRecap = "detaille" | "totaux";

/** Récap du cycle. « detaille » : nombre à jour + qui doit encore quoi ; « totaux » : chiffres seulement. */
export function construireRecap(
  suivi: Suivi,
  contexte: { caisse: string; cycle: number; dateEcheance: Date; mensualite?: boolean },
  format: FormatRecap,
) {
  const t = suivi.totaux;
  const lignes = [
    contexte.mensualite
      ? `${contexte.caisse} (jusqu'au ${formaterDate(contexte.dateEcheance)}), à ce jour`
      : `${contexte.caisse}, cycle ${contexte.cycle} (échéance le ${formaterDate(contexte.dateEcheance)})`,
    `À jour : ${t.payes} sur ${t.membres}`,
  ];
  const parCellule = totauxParCellule(suivi);
  if (format === "totaux") {
    lignes.push(`Partiels : ${t.partiels}, rien versé : ${t.enAttente}`);
    lignes.push(`Reçu : ${formaterFCFA(t.recu)} sur ${formaterFCFA(t.attendu)} (reste ${formaterFCFA(t.reste)})`);
    if (parCellule.length > 0) lignes.push("", ...parCellule.map((c) => `${c.cellule} : ${c.payes} à jour sur ${c.membres}`));
  } else {
    const restants = trierSuivi([...suivi.actifs, ...suivi.retires].filter((l) => !l.aJour), "ordre");
    const ligne = (l: LigneSuivi) => `- ${l.nom} : ${formaterFCFA(l.reste)}`;
    if (restants.length === 0) lignes.push("", "Tout le monde est à jour, merci à toutes et à tous !");
    else if (parCellule.length === 0) lignes.push("", "Reste à verser :", ...restants.map(ligne));
    else {
      // Regroupé par cellule (phase 10) : chaque cellule voit qui, chez elle, doit encore verser.
      lignes.push("", "Reste à verser :");
      for (const cellule of cellulesDu(restants)) {
        const siens = restants.filter((l) => (l.cellule || SANS_CELLULE) === cellule);
        lignes.push("", `${cellule} (${siens.length})`, ...siens.map(ligne));
      }
    }
  }
  return lignes.join("\n");
}
