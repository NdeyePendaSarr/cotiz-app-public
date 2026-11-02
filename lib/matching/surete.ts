// Rapprochement groupé (lot 4) : un paiement est « sûr » quand il n'y a rien à décider.
// Pur (aucune base) : sert au tri dans le navigateur ET à la revérification côté serveur.

import { proposerRepartition, type EcheanceDue, type Repartition } from "@/lib/matching/allocation";
import type { Identification } from "@/lib/matching/personne";

/**
 * Répartition à valider sans ouvrir le paiement, ou null s'il faut le vérifier. Sûr =
 * 1. une seule personne, trouvée par son numéro ou déjà identifiée (confiance haute) ;
 * 2. une répartition qui tombe juste (une échéance ou une combinaison exacte), sans excédent
 *    ni autre répartition possible. Un paiement partiel n'est jamais sûr : il faut choisir où il va.
 */
export function repartitionSure(identification: Identification, montant: number, echeancesDues: EcheanceDue[]): Repartition | null {
  const { proposee, candidats } = identification;
  if (!proposee || candidats.length !== 1 || candidats[0].id !== proposee || candidats[0].confiance !== "haute") return null;
  const proposition = proposerRepartition(montant, echeancesDues);
  const juste = proposition.type === "exacte" || proposition.type === "combinaison";
  if (!juste || proposition.principale.excedent !== 0 || proposition.alternatives.length > 0) return null;
  return proposition.principale;
}

/** Nombre maximal de paiements validés d'un coup (garde-fou de la Server Action). */
export const MAX_VALIDATION_GROUPEE = 100;

/** Libellé du niveau de confiance (3 niveaux, avec la raison) : jamais un pourcentage inventé. */
export const NIVEAUX_CONFIANCE = { haute: "Identifiée", moyenne: "Probable", basse: "À confirmer" } as const;
