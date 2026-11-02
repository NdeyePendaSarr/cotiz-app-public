import { normaliserNom } from "@/lib/texte";

type Cherchable = { nomComplet: string; aliasWave: string[]; numeros: { numero: string }[] };

/**
 * Filtre des personnes par nom, alias ou numéro, sans tenir compte de la casse ni des accents.
 * Fait en mémoire : une trésorière a quelques centaines de personnes au plus, et PostgreSQL
 * ne sait pas ignorer les accents sans extension (unaccent).
 */
export function rechercherPersonnes<T extends Cherchable>(personnes: T[], recherche: string): T[] {
  const texte = normaliserNom(recherche);
  if (!texte) return personnes;
  const chiffres = recherche.replace(/\D/g, "");
  const parNumero = chiffres.length >= 3; // « 77 » seul correspondrait à presque tout le monde

  return personnes.filter(
    (p) =>
      [p.nomComplet, ...p.aliasWave].some((n) => normaliserNom(n).includes(texte)) ||
      (parNumero && p.numeros.some((n) => n.numero.includes(chiffres))),
  );
}
