import { z } from "zod";
import { Canal } from "@/lib/generated/prisma/enums";
import { schemaMontant } from "@/lib/validation/montant";

/** Saisie manuelle d'un paiement (Wave sans SMS, Orange Money, cash). */
export const schemaPaiementManuel = z
  .object({
    canal: z.enum([Canal.WAVE, Canal.ORANGE_MONEY, Canal.CASH], { error: "Choisis le canal." }),
    montant: schemaMontant("Indique le montant."),
    date: z.iso.date({ error: "Indique la date." }),
    heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Indique l'heure (ex. 14:30)." }),
    personneId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
    reference: z
      .string()
      .trim()
      .max(100, { error: "100 caractères maximum." })
      .transform((v) => v || null),
    note: z
      .string()
      .trim()
      .max(500, { error: "500 caractères maximum." })
      .transform((v) => v || null),
  })
  .transform(({ date, heure, canal, reference, ...reste }) => ({
    ...reste,
    canal,
    // Heure de Dakar = UTC.
    dateReception: new Date(`${date}T${heure}:00.000Z`),
    // Pas de référence pour le cash ; références Wave en majuscules, comme dans les SMS.
    reference: canal === Canal.CASH ? null : canal === Canal.WAVE ? (reference?.toUpperCase() ?? null) : reference,
  }));

export type PaiementManuel = z.infer<typeof schemaPaiementManuel>;

/** Une date de réception dans le futur est une erreur de saisie (marge d'une minute). */
export function estDansLeFutur(date: Date, maintenant = new Date()) {
  return date.getTime() > maintenant.getTime() + 60_000;
}
