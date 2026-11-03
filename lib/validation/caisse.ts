import { z } from "zod";
import { Frequence, TypeCaisse } from "@/lib/generated/prisma/enums";
import { finMensualite, lireMois } from "@/lib/mensualite";
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

// Mensualité : montant par mois, nombre de mois et premier mois (ce mois-ci ou un autre, décidé en réunion).
const mensualite = z.object({
  type: z.literal(TypeCaisse.MENSUALITE),
  nom,
  montantCotisation: schemaMontant("Indique le montant par mois."),
  modeleRelance,
  nombreMois: entier("Indique le nombre de mois.").refine((n) => n >= 1 && n <= 36, { error: "Entre 1 et 36 mois." }),
  moisDebut: z
    .string({ error: "Choisis le premier mois." })
    .transform((t, ctx) => lireMois(t) ?? (ctx.addIssue({ code: "custom", message: "Choisis le premier mois." }), z.NEVER)),
});

// Compte gardé : un nom et un titulaire (choisi à la création, jamais changé ensuite) ; pas de montant.
const compteGarde = z.object({
  type: z.literal(TypeCaisse.COMPTE_GARDE),
  nom,
  titulaireId: z.uuid({ error: "Choisis la personne pour qui tu gardes l'argent." }).optional(),
});

/** Saisie du formulaire de caisse (création et modification). */
export const schemaCaisse = z.discriminatedUnion("type", [tontine, collecte, mensualite, compteGarde], {
  error: "Choisis le type de caisse.",
});

export type DonneesCaisse = z.infer<typeof schemaCaisse>;

/** Champs à écrire en base : les champs propres à l'autre type sont remis à null. */
export function versChampsCaisse(c: DonneesCaisse) {
  const aucun = { frequence: null, jourEcheance: null, dateLimite: null, moisDebut: null, nombreMois: null };
  if (c.type === TypeCaisse.COMPTE_GARDE) return { ...aucun, nom: c.nom, montantCotisation: 0, modeleRelance: null, type: c.type };
  if (c.type === TypeCaisse.MENSUALITE) {
    return {
      ...aucun,
      nom: c.nom,
      montantCotisation: c.montantCotisation,
      modeleRelance: c.modeleRelance,
      type: c.type,
      moisDebut: c.moisDebut,
      nombreMois: c.nombreMois,
      dateLimite: finMensualite(c.moisDebut, c.nombreMois),
    };
  }
  return c.type === TypeCaisse.TONTINE
    ? { ...aucun, nom: c.nom, montantCotisation: c.montantCotisation, modeleRelance: c.modeleRelance, type: c.type, frequence: c.frequence, jourEcheance: c.jourEcheance }
    : { ...aucun, nom: c.nom, montantCotisation: c.montantCotisation, modeleRelance: c.modeleRelance, type: c.type, dateLimite: c.dateLimite };
}

export const schemaIdentifiant = z.uuid({ error: "Identifiant invalide." });
