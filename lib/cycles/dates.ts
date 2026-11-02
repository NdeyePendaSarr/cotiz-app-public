// Calcul des dates d'échéance des cycles. Fonctions pures, en UTC : Dakar est à UTC+0 et
// les dates sont stockées en @db.Date (minuit UTC). Aucune dépendance de date nécessaire.

import type { Frequence } from "@/lib/generated/prisma/enums";

const JOUR_MS = 86_400_000;

/** Date du jour à Dakar, à minuit (UTC). */
export function aujourdhui(maintenant = new Date()) {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
}

export function ajouterJours(date: Date, jours: number) {
  return new Date(date.getTime() + jours * JOUR_MS);
}

/** Nombre de jours du mois (mois de 0 à 11) : le « jour 0 » du mois suivant est le dernier jour de celui-ci. */
export function joursDansLeMois(annee: number, mois: number) {
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/** Jour `jour` du mois, ramené au dernier jour si le mois est plus court (31 → 30 avril, 28/29 février). */
function jourDuMois(annee: number, mois: number, jour: number) {
  return new Date(Date.UTC(annee, mois, Math.min(jour, joursDansLeMois(annee, mois))));
}

/** Prochaine échéance mensuelle à partir de `depuis`, le jour même compris. */
export function prochaineEcheanceMensuelle(depuis: Date, jour: number) {
  const ceMois = jourDuMois(depuis.getUTCFullYear(), depuis.getUTCMonth(), jour);
  if (ceMois >= depuis) return ceMois;
  return jourDuMois(depuis.getUTCFullYear(), depuis.getUTCMonth() + 1, jour); // décembre + 1 → janvier : Date.UTC gère
}

/** Prochaine échéance hebdomadaire (jour ISO : 1 = lundi … 7 = dimanche), le jour même compris. */
export function prochaineEcheanceHebdomadaire(depuis: Date, jourIso: number) {
  const jourDepuis = depuis.getUTCDay() || 7; // getUTCDay : 0 = dimanche → 7
  return ajouterJours(depuis, (jourIso - jourDepuis + 7) % 7);
}

/** Échéance d'un cycle de tontine qui commence le `debut`. null si la fréquence n'est pas gérée (bimensuelle, masquée en v0). */
export function prochaineEcheance(frequence: Frequence | null, jour: number | null, debut: Date): Date | null {
  if (!jour) return null;
  if (frequence === "MENSUELLE" && jour >= 1 && jour <= 31) return prochaineEcheanceMensuelle(debut, jour);
  if (frequence === "HEBDOMADAIRE" && jour >= 1 && jour <= 7) return prochaineEcheanceHebdomadaire(debut, jour);
  return null;
}
