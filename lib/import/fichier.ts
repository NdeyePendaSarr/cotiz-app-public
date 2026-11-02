// Fichier choisi dans « Importer une liste » : seul du texte (.txt, .csv) peut être lu.
// Un document Word ou Excel est une archive compressée : lu comme du texte, il donne des
// caractères illisibles. Fonction pure, testée.

/** null si le fichier est lisible, sinon le message à afficher. */
export function refusFichier(nom: string, contenu: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(nom)?.[1]?.toLowerCase() ?? "";
  if (["doc", "docx", "odt", "rtf"].includes(extension)) {
    return "Ce fichier est un document Word : ouvre-le, sélectionne le tableau (en-tête compris), copie-le et colle-le dans le champ ci-dessus.";
  }
  if (["xls", "xlsx", "ods"].includes(extension)) {
    return "Ce fichier est un classeur Excel : ouvre-le, sélectionne les lignes (en-tête compris), copie-les et colle-les dans le champ ci-dessus.";
  }
  // Contenu binaire, quelle que soit l'extension : archive (« PK »), PDF, octets nuls ou illisibles.
  if (contenu.startsWith("PK") || contenu.startsWith("%PDF") || /[\u0000�]/.test(contenu.slice(0, 2000))) {
    return "Ce fichier n'est pas du texte. Ouvre-le, copie le tableau (en-tête compris) et colle-le dans le champ ci-dessus.";
  }
  return null;
}
