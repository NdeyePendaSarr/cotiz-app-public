// Correction du canal d'un paiement (Wave, Orange Money, espèces). Pur, testé : sert à la page du
// paiement (afficher ou non le choix) et à la Server Action, qui revérifie tout dans sa transaction.

type Corrigeable = { source: "SMS_WAVE" | "SAISIE_MANUELLE"; reference: string | null; datation: "NON_DATEE" | "PAR_SMS" | "A_LA_MAIN" | null };

/**
 * null si le canal peut être corrigé, sinon la raison du refus. Seul un canal déclaré par la
 * trésorière se corrige (versé repris d'une liste, saisie manuelle) : un SMS collé, une référence
 * ou une datation par SMS prouvent le canal.
 */
export function refusCorrectionCanal(p: Corrigeable): string | null {
  if (p.source === "SMS_WAVE") return "Ce paiement vient d'un SMS Wave : son canal est prouvé.";
  if (p.datation === "PAR_SMS") return "Ce versé est daté par un SMS ou une référence : son canal est prouvé.";
  if (p.reference) return "Ce paiement porte une référence de transaction : son canal est prouvé.";
  return null;
}
