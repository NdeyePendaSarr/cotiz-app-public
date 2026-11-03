// Paiement Wave sans SMS : la trésorière part d'un modèle au format du SMS Wave, prérempli avec ce
// que Cotiz connaît (montant, personne, numéro, mois en cours), et y recopie depuis l'application
// Wave la date, l'heure et l'ID de transaction. Pur (aucune base), testé.

import { formaterTelephone } from "@/lib/telephone";

/** Ligne de l'ID de transaction dans le modèle (l'application l'affiche ainsi). */
const LIGNE_ID = /^\s*ID de transaction\s*:?\s*(.*)$/im;

/** « 2.000F » : séparateur de milliers « . », comme dans les SMS Wave. */
const montantWave = (montant: number) => `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}F`;

/** Modèle prérempli : seules la date (JJ et l'heure) et l'ID sont à remplacer. */
export function modeleWave(p: { montant: number; nom: string | null; numero: string | null; aujourdhui: Date }) {
  const mois = String(p.aujourdhui.getUTCMonth() + 1).padStart(2, "0");
  const de = [p.nom ?? "Nom", p.numero ? `(${formaterTelephone(p.numero)})` : null].filter(Boolean).join(" ");
  return [`Vous avez recu ${montantWave(p.montant)}`, `De ${de}`, `JJ/${mois}/${p.aujourdhui.getUTCFullYear()} à HHhMM`, "ID de transaction : T_"].join("\n");
}

/**
 * Référence d'un paiement Wave sous une seule forme : l'ID de transaction de l'application
 * (« T_QWE…U-IOP… ») est la référence du SMS (« TQWE…UIOP… ») avec des « _ » et « - » en plus.
 */
export function normaliserReferenceWave(texte: string) {
  return texte.toUpperCase().replace(/[\s_-]/g, "");
}

/**
 * Sépare le modèle rempli : le texte au format SMS (lu ensuite comme un SMS Wave) et l'ID de
 * transaction, ramené à la forme de la référence des SMS (« T_QWE…U-IOP… » → « TQWE…UIOP… »).
 */
export function lireModeleWave(texte: string): { texteSms: string; reference: string | null } {
  const m = LIGNE_ID.exec(texte);
  const reference = normaliserReferenceWave(m?.[1] ?? "");
  return { texteSms: texte.replace(LIGNE_ID, ""), reference: /^[A-Z0-9]{8,30}$/.test(reference) ? reference : null };
}
