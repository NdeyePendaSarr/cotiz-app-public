// Comparaison de noms : « Aïssatou  NDIAYE » et « aissatou ndiaye » sont le même nom.
// Utilisé pour la détection des doublons (phase 4) et le matching des alias Wave (phase 7).

/** Minuscules, sans accents, espaces réduites. Ne sert qu'à comparer, jamais à afficher. */
export function normaliserNom(nom: string) {
  if (typeof nom !== "string") return "";
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents (é → e, ï → i)
    .toLowerCase()
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/** Nom propre pour l'affichage et le stockage : espaces réduites, casse conservée. */
export function nettoyerNom(nom: string) {
  return typeof nom === "string" ? nom.replace(/[\s  ]+/g, " ").trim() : "";
}
