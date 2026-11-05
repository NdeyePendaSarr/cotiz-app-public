import { z } from "zod";

/** Plafond de tout montant en FCFA : au-delà, c'est une erreur de saisie ou de lecture. */
export const MONTANT_MAX = 10_000_000;

/**
 * Chiffres d'un montant en FCFA, sans séparateurs : « 25 000 », « 25.000 », « 25000 » → « 25000 ».
 * Le point sépare les milliers (par groupes de 3). Les FCFA n'ont pas de centimes : « 5000.00 » ou
 * « 5 000,00 » → « 5000 », mais « 1.5 » ou « 2,5 » → null (jamais lus comme 15 ou 25).
 */
export function chiffresFcfa(texte: string): string | null {
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:[.,]0{1,2})?$/.exec(texte.replace(/\s/g, ""));
  return m ? m[1].replaceAll(".", "") : null;
}

/**
 * Montant en FCFA saisi dans un formulaire : voir chiffresFcfa.
 * Entier strictement positif, plafonné.
 */
export function schemaMontant(messageVide: string) {
  return z
    .string({ error: messageVide })
    .transform((v) => chiffresFcfa(v) ?? v)
    .pipe(
      z
        .string()
        .regex(/^\d+$/, { error: "Le montant doit être un nombre entier de FCFA." })
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .min(1, { error: "Le montant doit être supérieur à 0." })
            .max(MONTANT_MAX, { error: "Montant trop élevé." }),
        ),
    );
}
