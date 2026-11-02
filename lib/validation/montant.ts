import { z } from "zod";

const MONTANT_MAX = 10_000_000;

/**
 * Montant en FCFA saisi dans un formulaire : « 25 000 », « 25.000 » ou « 25000 » → 25000.
 * Les FCFA n'ont pas de centimes : entier strictement positif.
 */
export function schemaMontant(messageVide: string) {
  return z
    .string({ error: messageVide })
    .transform((v) => v.replace(/[\s.  ]/g, ""))
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
