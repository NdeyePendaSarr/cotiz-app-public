import { z } from "zod";

/** Formulaire d'ouverture du premier cycle d'une tontine (numéro et date modifiables). */
export const schemaOuvertureCycle = z.object({
  numero: z
    .string({ error: "Indique le numéro du cycle." })
    .trim()
    .regex(/^\d+$/, { error: "Le numéro doit être un entier." })
    .transform(Number)
    .pipe(z.number().int().min(1, { error: "Le numéro commence à 1." }).max(9999, { error: "Numéro trop grand." })),
  dateEcheance: z.iso
    .date({ error: "Indique la date d'échéance." })
    .transform((d) => new Date(`${d}T00:00:00.000Z`)),
});
