import { z } from "zod";
import { Canal, CategorieDepense } from "@/lib/generated/prisma/enums";
import { schemaMontant } from "@/lib/validation/montant";

// Sortie de caisse (phase 11) : date, montant, motif, bénéficiaire, canal et catégorie.

export const CHAMPS_DEPENSE = ["date", "montant", "motif", "beneficiaire", "canal", "categorie"] as const;

export const schemaDepense = z.object({
  date: z.iso.date({ error: "Indique la date." }).transform((d) => new Date(`${d}T00:00:00.000Z`)),
  montant: schemaMontant("Indique le montant."),
  motif: z
    .string({ error: "Indique le motif." })
    .trim()
    .min(1, { error: "Indique le motif." })
    .max(200, { error: "200 caractères maximum." }),
  beneficiaire: z
    .string()
    .trim()
    .max(150, { error: "150 caractères maximum." })
    .default("")
    .transform((v) => v || null),
  canal: z.enum(Canal, { error: "Choisis le canal." }),
  categorie: z.enum(CategorieDepense, { error: "Choisis la catégorie." }),
});

export type DonneesDepense = z.infer<typeof schemaDepense>;

/** Lit le formulaire : les valeurs saisies, telles quelles (renvoyées en cas d'erreur). */
export function lireFormulaireDepense(formData: FormData) {
  const valeurs: Record<(typeof CHAMPS_DEPENSE)[number], string> = { date: "", montant: "", motif: "", beneficiaire: "", canal: "", categorie: "" };
  for (const champ of CHAMPS_DEPENSE) {
    const v = formData.get(champ);
    valeurs[champ] = typeof v === "string" ? v : "";
  }
  return valeurs;
}
