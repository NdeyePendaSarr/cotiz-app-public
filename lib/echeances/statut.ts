// Statut d'une échéance, calculé à partir de ses allocations (cahier) — jamais stocké.

export type StatutEcheance = "EN_ATTENTE" | "PARTIEL" | "PAYE";

export function statutEcheance(montantDu: number, alloue: number): StatutEcheance {
  if (alloue <= 0) return "EN_ATTENTE";
  return alloue >= montantDu ? "PAYE" : "PARTIEL";
}

export const LIBELLES_STATUT_ECHEANCE: Record<StatutEcheance, string> = {
  EN_ATTENTE: "En attente",
  PARTIEL: "Partiel",
  PAYE: "Payé",
};
