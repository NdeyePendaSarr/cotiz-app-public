// Paiement Orange Money à dater (page « Dater les versés ») : le SMS Orange Money ne contient pas
// la date (seulement montant, expéditeur, référence et solde), et son parser est prévu en v1 (cahier).
// La trésorière complète donc un modèle Cotiz, prérempli avec ce que Cotiz connaît, en recopiant
// depuis l'application Orange Money la date, l'heure et la référence (« PP… »). Pur, testé.

import { formaterFCFA } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";

/** Modèle prérempli : seules la date (JJ et l'heure) et la référence sont à compléter. */
export function modeleOrangeMoney(p: { montant: number; nom: string | null; numero: string | null; aujourdhui: Date }) {
  const mois = String(p.aujourdhui.getUTCMonth() + 1).padStart(2, "0");
  const de = [p.nom ?? "Nom", p.numero ? `(${formaterTelephone(p.numero)})` : null].filter(Boolean).join(" ");
  return [`Orange Money · ${formaterFCFA(p.montant)} de ${de}`, `Date : JJ/${mois}/${p.aujourdhui.getUTCFullYear()} à HHhMM`, "Référence : PP"].join("\n");
}

/**
 * Lit le modèle complété : date et heure (« 31/10/2026 à 01h38 » ou « 01:38 », heure de Dakar = UTC)
 * et référence (majuscules, sans espaces : « PP260415.0932.C48217 »). null si absent ou incomplet.
 */
export function lireModeleOrangeMoney(texte: string): { dateReception: Date | null; reference: string | null } {
  const d = /^\s*Date\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(?:à|a)\s+(\d{1,2})\s*[h:]\s*(\d{2})\s*$/im.exec(texte);
  let dateReception: Date | null = null;
  if (d) {
    const [jour, mois, annee, heure, minute] = d.slice(1).map(Number);
    const date = new Date(Date.UTC(annee, mois - 1, jour, heure, minute));
    const coherente = heure <= 23 && minute <= 59 && date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
    dateReception = coherente ? date : null;
  }
  const r = /^\s*R[ée]f[ée]rence\s*:?\s*(.*)$/im.exec(texte);
  const reference = (r?.[1] ?? "").toUpperCase().replace(/\s+/g, "");
  return { dateReception, reference: /^[A-Z0-9][A-Z0-9.]{7,39}$/.test(reference) ? reference : null };
}
