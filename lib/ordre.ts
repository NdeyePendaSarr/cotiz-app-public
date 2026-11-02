/** Plus petit ordre de passage libre : [1, 2, 4] → 3 ; [] → 1. Suggestion pour une attribution manuelle. */
export function plusPetitOrdreLibre(ordres: (number | null)[]) {
  const pris = new Set(ordres.filter((o): o is number => o !== null));
  let ordre = 1;
  while (pris.has(ordre)) ordre++;
  return ordre;
}
