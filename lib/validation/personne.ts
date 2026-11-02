import { z } from "zod";
import { normaliserTelephone } from "@/lib/telephone";
import { nettoyerNom, normaliserNom } from "@/lib/texte";

export const MAX_NUMEROS = 5;
export const MAX_ALIAS = 10;

const ligneNumero = z.object({
  numero: z
    .string()
    .transform((v, ctx) => {
      const n = normaliserTelephone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Numéro invalide (9 chiffres, ex. 77 123 45 67)." });
        return z.NEVER;
      }
      return n;
    }),
  libelle: z
    .string()
    .trim()
    .max(50, { error: "50 caractères maximum." })
    .transform((v) => v || null),
});

/** Saisie d'une personne. Les numéros et les alias sont facultatifs (un membre peut payer en cash). */
export const schemaPersonne = z
  .object({
    nomComplet: z
      .string({ error: "Indique le nom complet." })
      .transform(nettoyerNom)
      .pipe(z.string().min(1, { error: "Indique le nom complet." }).max(150, { error: "150 caractères maximum." })),
    // Cellule de la commission (phase 10) : facultative, absente ou vide → null.
    cellule: z
      .string()
      .default("")
      .transform(nettoyerNom)
      .pipe(z.string().max(50, { error: "50 caractères maximum." }))
      .transform((v) => v || null),
    numeros: z.array(ligneNumero).max(MAX_NUMEROS, { error: `${MAX_NUMEROS} numéros maximum.` }),
    aliasWave: z
      .array(z.string().transform(nettoyerNom).pipe(z.string().max(150, { error: "150 caractères maximum." })))
      .max(MAX_ALIAS, { error: `${MAX_ALIAS} alias maximum.` })
      // Les alias vides sont ignorés ; un même alias n'est gardé qu'une fois (sa première écriture).
      .transform((alias) => {
        const vus = new Set<string>();
        return alias.filter((a) => {
          const cle = normaliserNom(a);
          if (!cle || vus.has(cle)) return false;
          vus.add(cle);
          return true;
        });
      }),
  })
  .superRefine((p, ctx) => {
    const vus = new Set<string>();
    p.numeros.forEach((n, i) => {
      if (vus.has(n.numero)) ctx.addIssue({ code: "custom", path: ["numeros", i, "numero"], message: "Numéro en double." });
      vus.add(n.numero);
    });
  });

export type DonneesPersonne = z.infer<typeof schemaPersonne>;

/** Lit le formulaire : cellule, listes parallèles numero[] / libelle[] et alias[]. Lignes entièrement vides ignorées. */
export function lireFormulairePersonne(formData: FormData) {
  const textes = (cle: string) => formData.getAll(cle).map((v) => (typeof v === "string" ? v : ""));
  const libelles = textes("libelle");
  const numeros = textes("numero")
    .map((numero, i) => ({ numero, libelle: libelles[i] ?? "" }))
    .filter((l) => l.numero.trim() !== "" || l.libelle.trim() !== "");
  return { nomComplet: textes("nomComplet")[0] ?? "", cellule: textes("cellule")[0] ?? "", numeros, aliasWave: textes("alias") };
}

// ─── Détection des doublons ──────────────────────────────────────────────────

export type PersonneComparee = { id: string; nomComplet: string; aliasWave: string[]; numeros: string[] };

export type Doublons = {
  /** Personnes qui ont déjà l'un des numéros saisis (souvent la même personne). */
  memeNumero: { personne: PersonneComparee; numero: string }[];
  /** Personnes au nom identique (ou un alias identique) mais sans numéro commun : peut-être un homonyme. */
  memeNom: PersonneComparee[];
};

/**
 * Compare une saisie aux personnes existantes de la trésorière. Ne décide rien :
 * l'écran montre le résultat et la trésorière choisit (cahier, phase 4).
 * idExclu : la personne en cours de modification, qui ne doit pas se trouver elle-même.
 */
export function chercherDoublons(
  saisie: { nomComplet: string; numeros: string[] },
  existantes: PersonneComparee[],
  idExclu?: string,
): Doublons {
  const autres = existantes.filter((p) => p.id !== idExclu);
  const numerosSaisis = new Set(saisie.numeros);
  const nomSaisi = normaliserNom(saisie.nomComplet);

  const memeNumero = autres.flatMap((personne) =>
    personne.numeros.filter((n) => numerosSaisis.has(n)).map((numero) => ({ personne, numero })),
  );
  const dejaTrouvees = new Set(memeNumero.map((d) => d.personne.id));
  const memeNom = autres.filter(
    (p) => !dejaTrouvees.has(p.id) && [p.nomComplet, ...p.aliasWave].some((n) => normaliserNom(n) === nomSaisi),
  );
  return { memeNumero, memeNom };
}

export function aDesDoublons(d: Doublons) {
  return d.memeNumero.length > 0 || d.memeNom.length > 0;
}
