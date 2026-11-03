import type { Frequence, TypeCaisse } from "@/lib/generated/prisma/enums";

// Affichage en français. Espace insécable avant « FCFA » : le montant ne se coupe
// jamais en fin de ligne. Le séparateur de milliers fr-FR est une espace fine insécable.
const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 25000 → « 25 000 FCFA » */
export function formaterFCFA(montant: number) {
  return `${NOMBRE.format(montant)} FCFA`;
}

// Dates stockées en @db.Date (minuit UTC) ; Dakar est à UTC+0, donc on affiche en UTC.
const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

/** 2026-12-15 → « 15 décembre 2026 » ; le premier du mois s'écrit « 1er octobre 2026 ». */
export function formaterDate(date: Date) {
  return DATE_LONGUE.format(date).replace(/^1 /, "1er ");
}

/** Date et heure de Dakar : « 27 octobre 2026, 16h15 » (comme dans les SMS Wave). */
export function formaterDateHeure(date: Date) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formaterDate(date)}, ${hh}h${mm}`;
}

export const LIBELLES_CANAL = { WAVE: "Wave", ORANGE_MONEY: "Orange Money", CASH: "Cash" } as const;

/** Date → « 8 oct. » (graphiques, listes courtes ; heure de Dakar = UTC). */
export function formaterJourCourt(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Date → « 2026-12-15 », la valeur attendue par <input type="date">. */
export function versChampDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const LIBELLES_TYPE: Record<TypeCaisse, string> = {
  TONTINE: "Tontine",
  COLLECTE: "Collecte",
  COMPTE_GARDE: "Compte gardé",
};

export const LIBELLES_FREQUENCE: Record<Frequence, string> = {
  HEBDOMADAIRE: "Hebdomadaire",
  BIMENSUELLE: "Bimensuelle",
  MENSUELLE: "Mensuelle",
};

// Convention ISO : 1 = lundi … 7 = dimanche.
export const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

/** Résumé lisible de l'échéance d'une tontine : « chaque samedi », « le 5 de chaque mois ». */
export function libelleEcheance(frequence: Frequence | null, jour: number | null) {
  if (!frequence || !jour) return null;
  if (frequence === "MENSUELLE") return `le ${jour === 1 ? "1er" : jour} de chaque mois`;
  const nomJour = JOURS_SEMAINE[jour - 1];
  if (!nomJour) return null;
  return frequence === "HEBDOMADAIRE" ? `chaque ${nomJour}` : `un ${nomJour} sur deux`;
}
