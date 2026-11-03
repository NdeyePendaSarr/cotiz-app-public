import type { Canal } from "@/lib/generated/prisma/enums";
import { ajouterJours } from "@/lib/cycles/dates";

// Statistiques de l'accueil (lot 3). Pur : aucune base, testable.
// « Reçu » ici = l'argent arrivé (date de réception), rapproché ou non, SMS ignorés exclus.
// Dakar est à l'heure UTC : le jour d'un paiement est la date UTC de sa réception.

export type PaiementRecu = {
  dateReception: Date;
  montant: number;
  canal: Canal;
  /** Versé repris d'une liste importée : sa date est celle de l'import, pas celle du paiement. */
  reprise?: boolean;
};

export type JourRecu = { date: Date; montant: number; nombre: number };

/** Ordre fixe des canaux (la couleur suit le canal, jamais son rang). */
export const ORDRE_CANAUX: Canal[] = ["WAVE", "ORANGE_MONEY", "CASH"];

const cleJour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Montant reçu chaque jour sur les `nbJours` jours qui finissent `jour` inclus (jour à 0 h UTC).
 * Les jours sans paiement valent 0 ; les paiements hors de la période sont ignorés, de même que
 * les versés repris d'un import (sans vraie date de paiement, ils feraient un faux pic le jour de l'import).
 */
export function recuParJour(paiements: PaiementRecu[], jour: Date, nbJours = 14): JourRecu[] {
  const jours = Array.from({ length: nbJours }, (_, i) => ({ date: ajouterJours(jour, i - nbJours + 1), montant: 0, nombre: 0 }));
  const index = new Map(jours.map((j) => [cleJour(j.date), j]));
  for (const p of paiements) {
    if (p.reprise) continue;
    const j = index.get(cleJour(p.dateReception));
    if (!j) continue;
    j.montant += p.montant;
    j.nombre += 1;
  }
  return jours;
}

/** Total des versés repris d'un import sur la période (affiché à part, sous « Reçu par jour »). */
export function totalReprises(paiements: PaiementRecu[]) {
  return paiements.reduce((s, p) => (p.reprise ? s + p.montant : s), 0);
}

/** Montant reçu par canal, dans l'ordre fixe des canaux (canaux sans paiement compris, à 0 ; reprises comprises). */
export function recuParCanal(paiements: PaiementRecu[]): { canal: Canal; montant: number }[] {
  return ORDRE_CANAUX.map((canal) => ({ canal, montant: paiements.reduce((s, p) => (p.canal === canal ? s + p.montant : s), 0) }));
}

/** Moyenne par jour sur la période (jours sans paiement compris), arrondie au franc. */
export function moyenneParJour(jours: JourRecu[]) {
  return jours.length === 0 ? 0 : Math.round(jours.reduce((s, j) => s + j.montant, 0) / jours.length);
}

// ─── Tendances et rythme (retouches du 03/11/2026) ───────────────────────────────

export type Tendance = { actuelle: number; precedente: number; ecart: number };

/**
 * Les 7 derniers jours face aux 7 d'avant, à partir des jours de « Reçu par jour » (14 jours,
 * versés repris non datés déjà exclus) : total reçu et moyenne par jour, avec leur écart.
 */
export function tendancesSemaine(jours: JourRecu[]): { recu: Tendance; moyenne: Tendance } {
  const somme = (js: JourRecu[]) => js.reduce((s, j) => s + j.montant, 0);
  const semaine = jours.slice(-7);
  const avant = jours.slice(-14, -7);
  const recu = { actuelle: somme(semaine), precedente: somme(avant), ecart: somme(semaine) - somme(avant) };
  const moyenne = (js: JourRecu[]) => (js.length === 0 ? 0 : Math.round(somme(js) / js.length));
  const m = { actuelle: moyenne(semaine), precedente: moyenne(avant), ecart: moyenne(semaine) - moyenne(avant) };
  return { recu, moyenne: m };
}

/** Cycle d'une collecte pour le rythme : ses dates, ce qui est attendu et ce qui est reçu. */
export type CycleRythme = { dateDebut: Date; dateEcheance: Date; attendu: number; recu: number };

export type Rythme = {
  attendu: number;
  recu: number;
  /** Ce qui serait reçu aujourd'hui si l'argent arrivait régulièrement de l'ouverture à l'échéance. */
  attenduAujourdhui: number;
  /** recu − attenduAujourdhui : négatif = en retard sur le rythme. */
  ecart: number;
  /** Ce qu'il faut recevoir chaque jour, aujourd'hui compris, pour tout avoir à l'échéance (0 si rien ne reste à faire). */
  necessaireParJour: number;
  /** Toutes les échéances sont passées : plus de rythme, seulement un reste. */
  echeancePassee: boolean;
};

const JOUR_MS = 86_400_000;

/**
 * Rythme des COLLECTES (règle validée le 03/11/2026 : pas les tontines, où chacun paie souvent juste
 * avant l'échéance). Repère linéaire : à mi-chemin entre l'ouverture et l'échéance, la moitié de
 * l'attendu. null s'il n'y a aucun cycle. Dates à minuit UTC (heure de Dakar).
 */
export function rythmeCollectes(cycles: CycleRythme[], jour: Date): Rythme | null {
  if (cycles.length === 0) return null;
  let attendu = 0;
  let recu = 0;
  let attenduAujourdhui = 0;
  let necessaireParJour = 0;
  let enCours = 0;
  for (const c of cycles) {
    attendu += c.attendu;
    recu += Math.min(c.recu, c.attendu);
    const duree = Math.max(1, Math.round((c.dateEcheance.getTime() - c.dateDebut.getTime()) / JOUR_MS));
    const ecoules = Math.min(duree, Math.max(0, Math.round((jour.getTime() - c.dateDebut.getTime()) / JOUR_MS)));
    attenduAujourdhui += Math.round((c.attendu * ecoules) / duree);
    const joursRestants = Math.round((c.dateEcheance.getTime() - jour.getTime()) / JOUR_MS) + 1;
    if (joursRestants > 0) {
      enCours++;
      necessaireParJour += Math.ceil(Math.max(0, c.attendu - c.recu) / joursRestants);
    }
  }
  return { attendu, recu, attenduAujourdhui, ecart: recu - attenduAujourdhui, necessaireParJour, echeancePassee: enCours === 0 };
}
