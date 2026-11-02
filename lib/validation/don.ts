import { z } from "zod";
import { Canal } from "@/lib/generated/prisma/enums";
import { schemaMontant } from "@/lib/validation/montant";

// Bonne volonté (don à une collecte) : date, montant, donateur (nom libre), remis par (intermédiaire), canal, note.

export const CHAMPS_DON = ["date", "montant", "donateur", "remisPar", "canal", "note"] as const;

export const schemaDon = z.object({
  date: z.iso.date({ error: "Indique la date." }).transform((d) => new Date(`${d}T00:00:00.000Z`)),
  montant: schemaMontant("Indique le montant."),
  donateur: z
    .string({ error: "Indique qui a donné." })
    .trim()
    .min(1, { error: "Indique qui a donné." })
    .max(150, { error: "150 caractères maximum." }),
  /** Vide : l'argent a été envoyé directement à la trésorière. */
  remisPar: z
    .string()
    .trim()
    .max(150, { error: "150 caractères maximum." })
    .default("")
    .transform((v) => v || null),
  canal: z.enum(Canal, { error: "Choisis le canal." }),
  note: z
    .string()
    .trim()
    .max(200, { error: "200 caractères maximum." })
    .default("")
    .transform((v) => v || null),
});

export type DonneesDon = z.infer<typeof schemaDon>;

/** Lit le formulaire : les valeurs saisies, telles quelles (renvoyées en cas d'erreur). */
export function lireFormulaireDon(formData: FormData) {
  const valeurs: Record<(typeof CHAMPS_DON)[number], string> = { date: "", montant: "", donateur: "", remisPar: "", canal: "", note: "" };
  for (const champ of CHAMPS_DON) {
    const v = formData.get(champ);
    valeurs[champ] = typeof v === "string" ? v : "";
  }
  return valeurs;
}
