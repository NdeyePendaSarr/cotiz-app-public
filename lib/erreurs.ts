// Trace d'une erreur serveur dans les journaux (Vercel). Jamais de message : celui d'une erreur Prisma
// peut citer des valeurs (noms, numéros, montants). Le type, le code, la référence affichée à
// l'utilisatrice (digest) et les lignes de code suffisent à retrouver le problème.

export function decrireErreur(erreur: unknown) {
  if (!(erreur instanceof Error)) return { type: typeof erreur };
  const { code, digest } = erreur as Error & { code?: unknown; digest?: unknown };
  const pile = (erreur.stack ?? "")
    .split("\n")
    // Le code de l'application seulement : les lignes des bibliothèques n'aident pas à trouver la cause.
    .filter((ligne) => /^\s+at /.test(ligne) && !/node_modules|node:internal/.test(ligne))
    .slice(0, 5)
    .map((ligne) => ligne.trim());
  return {
    type: erreur.name,
    ...(typeof code === "string" && { code }),
    ...(typeof digest === "string" && { digest }),
    pile,
  };
}

export function signalerErreur(contexte: string, erreur: unknown, details: Record<string, string> = {}) {
  console.error(JSON.stringify({ erreurCotiz: contexte, ...details, ...decrireErreur(erreur) }));
}
