import { z } from "zod";
import { Canal, SensMouvement } from "@/lib/generated/prisma/enums";
import { schemaMontant } from "@/lib/validation/montant";

// Mouvement d'un compte gardé : date, montant, sens (versement ou retrait), canal, note.

export const CHAMPS_MOUVEMENT = ["date", "montant", "sens", "canal", "note"] as const;

export const schemaMouvement = z.object({
  date: z.iso.date({ error: "Indique la date." }).transform((d) => new Date(`${d}T00:00:00.000Z`)),
  montant: schemaMontant("Indique le montant."),
  sens: z.enum(SensMouvement, { error: "Versement ou retrait ?" }),
  canal: z.enum(Canal, { error: "Choisis le canal." }),
  note: z
    .string()
    .trim()
    .max(200, { error: "200 caractères maximum." })
    .default("")
    .transform((v) => v || null),
});

export type DonneesMouvement = z.infer<typeof schemaMouvement>;

/** Lit le formulaire : les valeurs saisies, telles quelles (renvoyées en cas d'erreur). */
export function lireFormulaireMouvement(formData: FormData) {
  const valeurs: Record<(typeof CHAMPS_MOUVEMENT)[number], string> = { date: "", montant: "", sens: "", canal: "", note: "" };
  for (const champ of CHAMPS_MOUVEMENT) {
    const v = formData.get(champ);
    valeurs[champ] = typeof v === "string" ? v : "";
  }
  return valeurs;
}
