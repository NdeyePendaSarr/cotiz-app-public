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
