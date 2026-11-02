// Étape 1 du rapprochement (cahier) : identifier la personne qui a payé.
// Priorité : 1. numéro connu (confiance haute), 2. alias / nom identique (moyenne),
// 3. nom proche (basse, 3 suggestions au maximum). Fonction pure, testée.

import { similariteNom } from "@/lib/matching/similarite";
import { normaliserNom } from "@/lib/texte";

export type PersonneMatching = { id: string; nomComplet: string; aliasWave: string[]; numeros: string[] };
export type Confiance = "haute" | "moyenne" | "basse";
export type Candidat = { id: string; nomComplet: string; confiance: Confiance; raison: string };

export type Identification = {
  /** Personne proposée d'office (un seul candidat sûr) ; null s'il faut choisir. */
  proposee: string | null;
  candidats: Candidat[];
};

export const SEUIL_NOM_PROCHE = 0.8;
export const MAX_SUGGESTIONS = 3;

export function identifierPersonne(
  paiement: { personneId: string | null; telephoneExpediteur: string | null; nomExpediteur: string | null },
  personnes: PersonneMatching[],
): Identification {
  // Personne déjà connue (choisie à la saisie manuelle, ou rapprochement annulé) : on la garde.
  if (paiement.personneId) {
    const p = personnes.find((x) => x.id === paiement.personneId);
    if (p) return { proposee: p.id, candidats: [{ id: p.id, nomComplet: p.nomComplet, confiance: "haute", raison: "déjà identifiée" }] };
  }

  // 1. Numéro connu. Un numéro peut appartenir à deux personnes (couple) : il faut alors choisir.
  const tel = paiement.telephoneExpediteur;
  if (tel) {
    const parNumero = personnes.filter((p) => p.numeros.includes(tel));
    if (parNumero.length > 0) {
      return {
        proposee: parNumero.length === 1 ? parNumero[0].id : null,
        candidats: parNumero.map((p) => ({ id: p.id, nomComplet: p.nomComplet, confiance: "haute", raison: "numéro connu" })),
      };
    }
  }

  const nom = paiement.nomExpediteur;
  if (!nom) return { proposee: null, candidats: [] };

  // 2. Alias ou nom complet identique (sans accents, casse ni espaces en trop).
  const cle = normaliserNom(nom);
  const parAlias = personnes.filter((p) => [p.nomComplet, ...p.aliasWave].some((n) => normaliserNom(n) === cle));
  if (parAlias.length > 0) {
    return {
      proposee: parAlias.length === 1 ? parAlias[0].id : null,
      candidats: parAlias.map((p) => ({
        id: p.id,
        nomComplet: p.nomComplet,
        confiance: "moyenne",
        raison: p.aliasWave.some((a) => normaliserNom(a) === cle) ? "alias connu" : "même nom",
      })),
    };
  }

  // 3. Noms proches : suggestions seulement, jamais proposées d'office.
  const proches = personnes
    .map((p) => ({ p, score: Math.max(...[p.nomComplet, ...p.aliasWave].map((n) => similariteNom(nom, n))) }))
    .filter((x) => x.score >= SEUIL_NOM_PROCHE)
    .sort((a, b) => b.score - a.score || a.p.nomComplet.localeCompare(b.p.nomComplet))
    .slice(0, MAX_SUGGESTIONS);
  return {
    proposee: null,
    candidats: proches.map(({ p }) => ({ id: p.id, nomComplet: p.nomComplet, confiance: "basse", raison: "nom proche" })),
  };
}
