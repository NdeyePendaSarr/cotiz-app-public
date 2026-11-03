// Mensualité (ex. 500 FCFA par mois pendant 12 mois) : règles pures, testées, sans base.
// Une seule échéance par membre pour toute la durée (montant × nombre de mois) : un versement
// couvre toujours les mois les plus anciens d'abord, en retard comme en avance. L'état de chaque
// mois se déduit de ce qui a été versé. Les dates sont à minuit UTC (heure de Dakar).

import { joursDansLeMois } from "@/lib/cycles/dates";

export type EtatMois = "PAYE" | "PARTIEL" | "RETARD" | "EN_COURS" | "A_VENIR";

export const LIBELLES_ETAT_MOIS: Record<EtatMois, string> = {
  PAYE: "Payé",
  PARTIEL: "Partiel",
  RETARD: "En retard",
  EN_COURS: "À payer ce mois-ci",
  A_VENIR: "À venir",
};

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export type Mois = { numero: number; debut: Date; fin: Date; libelle: string };

/** « 2026-11 » → 1er novembre 2026 (minuit UTC), sinon null. */
export function lireMois(texte: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texte.trim());
  if (!m) return null;
  const [annee, mois] = [Number(m[1]), Number(m[2])];
  return mois >= 1 && mois <= 12 && annee >= 2000 && annee <= 2100 ? new Date(Date.UTC(annee, mois - 1, 1)) : null;
}

/** Les mois de la mensualité, du premier au dernier. */
export function moisMensualite(moisDebut: Date, nombreMois: number): Mois[] {
  return Array.from({ length: nombreMois }, (_, i) => {
    const annee = moisDebut.getUTCFullYear() + Math.floor((moisDebut.getUTCMonth() + i) / 12);
    const mois = (moisDebut.getUTCMonth() + i) % 12;
    return {
      numero: i + 1,
      debut: new Date(Date.UTC(annee, mois, 1)),
      fin: new Date(Date.UTC(annee, mois, joursDansLeMois(annee, mois))),
      libelle: `${MOIS_COURTS[mois]} ${String(annee).slice(2)}`,
    };
  });
}

/** Dernier jour du dernier mois : date limite de la mensualité (échéance de son cycle). */
export function finMensualite(moisDebut: Date, nombreMois: number) {
  return moisMensualite(moisDebut, nombreMois).at(-1)!.fin;
}

/** Montant dû par membre pour toute la durée (seul montant porté par l'échéance). */
export function montantDuParMembre(caisse: { type: string; montantCotisation: number; nombreMois?: number | null }) {
  return caisse.type === "MENSUALITE" ? caisse.montantCotisation * (caisse.nombreMois ?? 1) : caisse.montantCotisation;
}

export type SituationMensualite = {
  mois: (Mois & { etat: EtatMois; couvert: number })[];
  /** Dû pour les mois terminés : ce qui n'est pas versé là-dessus est en retard. */
  echu: number;
  /** Dû à ce jour, mois en cours compris (« dans le mois ») : base des relances. */
  exigible: number;
  retard: number;
  /** Versé au-delà de ce qui est dû à ce jour (mois payés d'avance). */
  avance: number;
};

/** État de chaque mois d'un membre, d'après tout ce qu'il a versé sur sa mensualité. */
export function situationMensualite(paye: number, montantMensuel: number, moisDebut: Date, nombreMois: number, jour: Date): SituationMensualite {
  const tous = moisMensualite(moisDebut, nombreMois);
  const mois = tous.map((m, i) => {
    const couvert = Math.min(montantMensuel, Math.max(0, paye - i * montantMensuel));
    const etat: EtatMois =
      couvert >= montantMensuel ? "PAYE" : m.fin < jour ? "RETARD" : m.debut <= jour ? (couvert > 0 ? "PARTIEL" : "EN_COURS") : couvert > 0 ? "PARTIEL" : "A_VENIR";
    return { ...m, etat, couvert };
  });
  const echu = tous.filter((m) => m.fin < jour).length * montantMensuel;
  const exigible = tous.filter((m) => m.debut <= jour).length * montantMensuel;
  return { mois, echu, exigible, retard: Math.max(0, echu - paye), avance: Math.max(0, Math.min(paye, nombreMois * montantMensuel) - exigible) };
}

type CaisseMensualite = { montantCotisation: number; moisDebut: Date | null; nombreMois: number | null };

/** Lignes de suivi d'une mensualité : ajoute le dû à ce jour (exigible) et le dû des mois terminés (echu). */
export function enrichirMensualite<T extends { paye: number }>(lignes: T[], caisse: CaisseMensualite, jour: Date): (T & { exigible: number; echu: number })[] {
  if (!caisse.moisDebut || !caisse.nombreMois) return lignes.map((l) => ({ ...l, exigible: 0, echu: 0 }));
  return lignes.map((l) => {
    const s = situationMensualite(l.paye, caisse.montantCotisation, caisse.moisDebut!, caisse.nombreMois!, jour);
    return { ...l, exigible: s.exigible, echu: s.echu };
  });
}

/** Numéro du mois en cours (1 = premier mois), 0 avant le début, nombreMois + 1 après la fin. */
export function moisEnCours(moisDebut: Date, nombreMois: number, jour: Date) {
  const tous = moisMensualite(moisDebut, nombreMois);
  if (jour < tous[0].debut) return 0;
  const i = tous.findIndex((m) => m.debut <= jour && jour <= m.fin);
  return i === -1 ? nombreMois + 1 : i + 1;
}

/** Grille « mois par mois » de la page : une ligne par membre (actifs d'abord, puis par nom). */
export function construireGrilleMois(
  lignes: { membreId: string; nom: string; membreActif: boolean; paye: number }[],
  montantMensuel: number,
  moisDebut: Date,
  nombreMois: number,
  jour: Date,
) {
  return {
    mois: moisMensualite(moisDebut, nombreMois).map((m) => m.libelle),
    lignes: [...lignes]
      .sort((a, b) => Number(b.membreActif) - Number(a.membreActif) || a.nom.localeCompare(b.nom, "fr"))
      .map((l) => {
        const s = situationMensualite(l.paye, montantMensuel, moisDebut, nombreMois, jour);
        return { id: l.membreId, libelle: l.nom, actif: l.membreActif, etats: s.mois.map((m) => m.etat), retard: s.retard, avance: s.avance };
      }),
  };
}
