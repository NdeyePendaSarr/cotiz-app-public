import { z } from "zod";
import { Frequence, TypeCaisse } from "@/lib/generated/prisma/enums";
import { schemaMontant } from "@/lib/validation/montant";

// Fréquences proposées dans le formulaire. BIMENSUELLE existe dans le schéma mais
// est masquée en v0 (aucune tontine de ce type, décision du cahier, phase 4).
export const FREQUENCES_PROPOSEES = [Frequence.MENSUELLE, Frequence.HEBDOMADAIRE] as const;

const montant = schemaMontant("Indique le montant par membre.");

// Modèle de relance WhatsApp propre à la caisse (vide = modèle par défaut de lib/relance.ts).
const modeleRelance = z
  .string()
  .trim()
  .max(1000, { error: "1 000 caractères maximum." })
  .optional()
  .transform((v) => v || null);

const nom = z
  .string({ error: "Indique le nom de la caisse." })
  .trim()
  .min(1, { error: "Indique le nom de la caisse." })
  .max(100, { error: "100 caractères maximum." });

const entier = (message: string) =>
  z
    .string({ error: message })
    .regex(/^\d+$/, { error: message })
    .transform(Number);

const tontine = z
  .object({
    type: z.literal(TypeCaisse.TONTINE),
    nom,
    montantCotisation: montant,
    modeleRelance,
    frequence: z.enum(FREQUENCES_PROPOSEES, { error: "Choisis la fréquence." }),
    jourEcheance: entier("Choisis le jour d'échéance."),
  })
  // Le jour dépend de la fréquence : 1 à 7 (lundi à dimanche) ou 1 à 31 (jour du mois).
  .superRefine((c, ctx) => {
    const max = c.frequence === Frequence.MENSUELLE ? 31 : 7;
    if (c.jourEcheance < 1 || c.jourEcheance > max) {
      ctx.addIssue({ code: "custom", path: ["jourEcheance"], message: "Jour d'échéance invalide." });
    }
  });

const collecte = z.object({
  type: z.literal(TypeCaisse.COLLECTE),
  nom,
  montantCotisation: montant,
  modeleRelance,
  dateLimite: z.iso
    .date({ error: "Choisis la date limite." })
    .transform((d) => new Date(`${d}T00:00:00.000Z`)),
});

/** Saisie du formulaire de caisse (création et modification). */
export const schemaCaisse = z.discriminatedUnion("type", [tontine, collecte], {
  error: "Choisis le type de caisse.",
});

export type DonneesCaisse = z.infer<typeof schemaCaisse>;

/** Champs à écrire en base : les champs propres à l'autre type sont remis à null. */
export function versChampsCaisse(c: DonneesCaisse) {
  return c.type === TypeCaisse.TONTINE
    ? { nom: c.nom, montantCotisation: c.montantCotisation, modeleRelance: c.modeleRelance, type: c.type, frequence: c.frequence, jourEcheance: c.jourEcheance, dateLimite: null }
    : { nom: c.nom, montantCotisation: c.montantCotisation, modeleRelance: c.modeleRelance, type: c.type, frequence: null, jourEcheance: null, dateLimite: c.dateLimite };
}

export const schemaIdentifiant = z.uuid({ error: "Identifiant invalide." });
