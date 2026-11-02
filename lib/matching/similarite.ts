// Similarité entre un nom Wave (souvent abrégé : « K Mbaye », « rokh ») et le nom d'une personne.
// Fonctions pures, sans dépendance. Score entre 0 (rien à voir) et 1 (identique).

import { normaliserNom } from "@/lib/texte";

/**
 * Jaro-Winkler : mesure classique pour les noms propres. Compte les lettres communes
 * proches, pénalise les inversions, et favorise un début identique (« abdou » / « abdoulaye »).
 */
export function jaroWinkler(a: string, b: string) {
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;

  const portee = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const vusA = new Array<boolean>(a.length).fill(false);
  const vusB = new Array<boolean>(b.length).fill(false);
  let communs = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - portee); j < Math.min(b.length, i + portee + 1); j++) {
      if (vusB[j] || a[i] !== b[j]) continue;
      vusA[i] = vusB[j] = true;
      communs++;
      break;
    }
  }
  if (communs === 0) return 0;

  let inversions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!vusA[i]) continue;
    while (!vusB[k]) k++;
    if (a[i] !== b[k]) inversions++;
    k++;
  }
  const jaro = (communs / a.length + communs / b.length + (communs - inversions / 2) / communs) / 3;

  let prefixe = 0;
  while (prefixe < 4 && a[prefixe] === b[prefixe]) prefixe++;
  return jaro + prefixe * 0.1 * (1 - jaro);
}

/** « K » vs « khadim » : une initiale vaut un prénom qui commence par elle. */
function scorePrenom(wave: string, candidat: string) {
  if (wave.length === 1) return candidat.startsWith(wave) ? 1 : 0;
  return jaroWinkler(wave, candidat);
}

/**
 * Similarité entre le nom Wave et UN nom de la personne (nom complet ou alias).
 * - Deux mots ou plus : nom de famille (dernier mot) 60 %, prénom (premier mot) 40 %.
 * - Un seul mot (« rokh ») : comparé à chaque mot du nom ; le meilleur l'emporte
 *   (« rokh » / « rokhaya » ≈ 0,91). Pas de pénalité : ces suggestions restent de toute
 *   façon en confiance basse, à choisir explicitement.
 */
export function similariteNom(nomWave: string, nomPersonne: string) {
  const w = normaliserNom(nomWave).split(" ").filter(Boolean);
  const p = normaliserNom(nomPersonne).split(" ").filter(Boolean);
  if (w.length === 0 || p.length === 0) return 0;
  if (w.join(" ") === p.join(" ")) return 1;

  if (w.length === 1) return Math.max(...p.map((mot) => jaroWinkler(w[0], mot)));
  if (p.length === 1) return Math.max(...w.map((mot) => jaroWinkler(mot, p[0])));

  const famille = jaroWinkler(w[w.length - 1], p[p.length - 1]);
  const prenom = scorePrenom(w[0], p[0]);
  return 0.6 * famille + 0.4 * prenom;
}
