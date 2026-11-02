// Préparation d'un SMS collé, avant tout accès à la base. Fonction pure, testée.
// Trois issues : un paiement à enregistrer, un SMS illisible à garder (SmsNonLu), ou un refus
// (rien n'est enregistré : texte vide, plusieurs SMS collés d'un coup).

import { parserSmsWave, retirerLigneSolde, type ChampFacultatif } from "@/lib/parsers/smsWave";

export type DonneesSms = {
  montant: number;
  nomExpediteur: string | null;
  telephoneExpediteur: string | null;
  dateReception: Date;
  reference: string | null;
};

export type PreparationSms =
  | { type: "paiement"; texteBrut: string; donnees: DonneesSms; champsManquants: ChampFacultatif[] }
  | { type: "non_lu"; texteBrut: string; raison: string }
  | { type: "refus"; raison: string };

const TAILLE_MAX = 2_000; // un SMS fait quelques centaines de caractères

export function preparerCaptureSms(texte: unknown): PreparationSms {
  if (typeof texte !== "string") return { type: "refus", raison: "Colle d'abord un SMS." };
  if (texte.length > TAILLE_MAX) return { type: "refus", raison: "Texte trop long pour un SMS." };

  // Le solde est retiré en tout premier : il n'est jamais lu ni stocké (cahier).
  const texteBrut = retirerLigneSolde(texte).trim();
  if (!texteBrut) return { type: "refus", raison: "Colle d'abord un SMS." };

  const resultat = parserSmsWave(texteBrut);
  if (resultat.ok) {
    const { montant, nomExpediteur, telephoneExpediteur, dateReception, reference, champsManquants } = resultat;
    return { type: "paiement", texteBrut, donnees: { montant, nomExpediteur, telephoneExpediteur, dateReception, reference }, champsManquants };
  }
  // Plusieurs SMS d'un coup : on demande de les coller un par un, rien n'est gardé.
  if (/SMS détectés/.test(resultat.raison)) return { type: "refus", raison: resultat.raison };
  return { type: "non_lu", texteBrut, raison: resultat.raison };
}
