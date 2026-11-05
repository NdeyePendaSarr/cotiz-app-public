// Lecture d'une liste collée depuis Word, Excel ou un fichier texte, et détection des colonnes.
// Fonctions pures : aucune base de données, tout est testable.

import { normaliserTelephone } from "@/lib/telephone";
import { normaliserNom } from "@/lib/texte";
import { chiffresFcfa, MONTANT_MAX } from "@/lib/validation/montant";

export const ROLES = ["nomComplet", "prenom", "nom", "telephone", "ordre", "cellule", "verse", "canal", "ignorer"] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLE: Record<Role, string> = {
  nomComplet: "Nom complet",
  prenom: "Prénom",
  nom: "Nom",
  telephone: "Téléphone",
  ordre: "Ordre de passage",
  cellule: "Cellule",
  verse: "Déjà versé",
  canal: "Canal du versé",
  ignorer: "Ignorer",
};

export type Tableau = {
  separateur: "tabulation" | "point-virgule" | "virgule";
  /** Lignes non vides, avec leur numéro dans le texte collé (pour les messages). */
  lignes: { numero: number; cellules: string[] }[];
  nbColonnes: number;
};

const ESPACES = /[\s  ]+/g;

/**
 * Découpe le texte en cellules. Séparateur : tabulation (copier-coller Word/Excel) si
 * présente, sinon « ; », sinon « , ». Les colonnes vides partout (bords du tableau Word)
 * sont retirées.
 */
export function lireTableau(texte: string): Tableau {
  const brutes = (typeof texte === "string" ? texte : "").replace(/﻿/g, "").split(/\r\n|\r|\n/);
  const separateur = brutes.some((l) => l.includes("\t")) ? "tabulation" : brutes.some((l) => l.includes(";")) ? "point-virgule" : "virgule";
  const sep = { tabulation: "\t", "point-virgule": ";", virgule: "," }[separateur];

  const lignes = brutes
    .map((l, i) => ({ numero: i + 1, cellules: l.split(sep).map((c) => c.replace(ESPACES, " ").trim().replace(/^"(.*)"$/, "$1")) }))
    .filter((l) => l.cellules.some((c) => c !== ""));

  const nbColonnes = Math.max(0, ...lignes.map((l) => l.cellules.length));
  const utiles = Array.from({ length: nbColonnes }, (_, j) => j).filter((j) => lignes.some((l) => (l.cellules[j] ?? "") !== ""));
  return {
    separateur,
    lignes: lignes.map((l) => ({ numero: l.numero, cellules: utiles.map((j) => l.cellules[j] ?? "") })),
    nbColonnes: utiles.length,
  };
}

// En-têtes reconnus (comparés sans accents ni majuscules).
const SYNONYMES: Record<Exclude<Role, "ignorer">, string[]> = {
  nomComplet: ["nom complet", "nom et prenom", "nom et prenoms", "prenom et nom", "prenom nom", "nom prenom", "membre", "membres", "nom du membre"],
  prenom: ["prenom", "prenoms"],
  nom: ["nom", "nom de famille"],
  telephone: ["telephone", "tel", "tel.", "contact", "wave", "numero de telephone", "numero wave", "portable", "mobile"],
  ordre: ["n°", "no", "n", "n.", "ordre", "rang", "ordre de passage", "#"],
  cellule: ["cellule", "cellules", "commission", "sous-commission"],
  // Montant déjà reçu (phase 10). « Montant » seul est la somme convenue : il reste ignoré.
  verse: ["verse", "versee", "deja verse", "montant verse", "somme versee", "versement", "paye", "deja paye", "montant paye"],
  // Moyen de paiement du versé (Wave, Orange Money, cash). « Wave » seul reste le numéro (téléphone).
  canal: ["canal", "moyen", "moyen de paiement", "mode", "mode de paiement", "paye par", "paiement par", "verse par", "via"],
};
// « Numéro » seul est ambigu (ordre ou téléphone) : tranché par le contenu de la colonne.
const AMBIGUS = ["numero", "num", "num."];

function roleEnTete(cellule: string): Role | "ambigu" | null {
  const c = normaliserNom(cellule);
  if (AMBIGUS.includes(c)) return "ambigu";
  for (const role of Object.keys(SYNONYMES) as (keyof typeof SYNONYMES)[]) {
    if (SYNONYMES[role].includes(c)) return role;
  }
  return null;
}

/** La colonne contient-elle surtout des numéros de téléphone (9 chiffres) ? */
function colonneDeTelephones(valeurs: string[]) {
  const remplies = valeurs.filter(Boolean);
  return remplies.length > 0 && remplies.filter((v) => normaliserTelephone(v)).length / remplies.length >= 0.5;
}

export type Detection = {
  /** Index de la ligne d'en-tête dans tableau.lignes, ou null s'il n'y en a pas. */
  ligneEnTete: number | null;
  roles: Role[];
};

/**
 * Détecte le rôle de chaque colonne : d'abord par l'en-tête (synonymes), puis par le contenu
 * pour les cas ambigus. Sans en-tête reconnu : ordre du cahier, nom ; numéro ; ordre.
 */
export function detecterColonnes(tableau: Tableau): Detection {
  const premiere = tableau.lignes[0]?.cellules ?? [];
  const candidats = premiere.map(roleEnTete);
  const aUnEnTete = candidats.some((r) => r !== null);
  const colonne = (j: number, depuis: number) => tableau.lignes.slice(depuis).map((l) => l.cellules[j] ?? "");

  if (!aUnEnTete) {
    const roles: Role[] = Array.from({ length: tableau.nbColonnes }, (_, j) =>
      j === 0 ? "nomComplet" : j === 1 ? "telephone" : j === 2 ? "ordre" : "ignorer",
    );
    // Si la 2e colonne n'a pas de numéros mais la 3e oui, on les inverse.
    if (roles[1] === "telephone" && !colonneDeTelephones(colonne(1, 0)) && colonneDeTelephones(colonne(2, 0))) {
      roles[1] = "ordre";
      roles[2] = "telephone";
    }
    return { ligneEnTete: null, roles };
  }

  const roles: Role[] = candidats.map((r, j) => {
    if (r === "ambigu") return colonneDeTelephones(colonne(j, 1)) ? "telephone" : "ordre";
    if (r === null) return colonneDeTelephones(colonne(j, 1)) ? "telephone" : "ignorer";
    return r;
  });
  return { ligneEnTete: 0, roles: unSeulRoleParColonne(roles) };
}

/** Un rôle (hors « ignorer ») n'est gardé que pour sa première colonne. */
function unSeulRoleParColonne(roles: Role[]): Role[] {
  const vus = new Set<Role>();
  return roles.map((r) => {
    if (r === "ignorer") return r;
    if (vus.has(r)) return "ignorer";
    vus.add(r);
    return r;
  });
}

export type LigneLue = {
  numero: number;
  nom: string;
  telephoneSaisi: string;
  ordreSaisi: string;
  celluleSaisie?: string;
  verseSaisi?: string;
  canalSaisi?: string;
};

export type LigneEcartee = { numero: number; texte: string; raison: string };

/** Applique les rôles : une ligne par membre ; les lignes sans nom et les totaux sont écartés. */
export function extraireLignes(tableau: Tableau, detection: Detection): { lues: LigneLue[]; ecartees: LigneEcartee[] } {
  const { roles } = detection;
  const val = (cellules: string[], role: Role) => {
    const j = roles.indexOf(role);
    return j === -1 ? "" : (cellules[j] ?? "");
  };

  const lues: LigneLue[] = [];
  const ecartees: LigneEcartee[] = [];
  tableau.lignes.forEach((ligne, i) => {
    if (i === detection.ligneEnTete) return;
    const texte = ligne.cellules.filter(Boolean).join(" · ");
    if (ligne.cellules.some((c) => /^(montant )?total\b/.test(normaliserNom(c)))) {
      ecartees.push({ numero: ligne.numero, texte, raison: "Ligne de total" });
      return;
    }
    const nom = [val(ligne.cellules, "nomComplet"), val(ligne.cellules, "prenom"), val(ligne.cellules, "nom")]
      .filter(Boolean)
      .join(" ")
      .replace(/ {2,}/g, " ")
      .trim();
    if (!nom) {
      ecartees.push({ numero: ligne.numero, texte, raison: "Pas de nom" });
      return;
    }
    lues.push({
      numero: ligne.numero,
      nom,
      telephoneSaisi: val(ligne.cellules, "telephone"),
      ordreSaisi: val(ligne.cellules, "ordre"),
      celluleSaisie: val(ligne.cellules, "cellule"),
      verseSaisi: val(ligne.cellules, "verse"),
      canalSaisi: val(ligne.cellules, "canal"),
    });
  });
  return { lues, ecartees };
}

/**
 * Montant déjà versé lu dans la colonne « Versé » : « 2 000 », « 2.000 », « 2000 F » ou
 * « 2 000 FCFA » → 2000 ; « 5000.00 » → 5000. Vide ou 0 → 0 (rien versé). Illisible (« 1.5 ») ou
 * au-dessus du plafond → null.
 */
export function lireVerse(texte: string): number | null {
  const t = texte.replace(/s/g, "").replace(/f(cfa)?$/i, "");
  if (t === "" || t === "-") return 0;
  const chiffres = chiffresFcfa(t);
  if (chiffres === null) return null;
  const montant = Number(chiffres);
  return montant <= MONTANT_MAX ? montant : null;
}

export type CanalLu = "WAVE" | "ORANGE_MONEY" | "CASH";

const CANAUX: Record<string, CanalLu> = {
  wave: "WAVE",
  "orange money": "ORANGE_MONEY",
  orange: "ORANGE_MONEY",
  om: "ORANGE_MONEY",
  cash: "CASH",
  especes: "CASH",
  espece: "CASH",
  liquide: "CASH",
  "main a main": "CASH",
};

/** Canal lu dans la colonne « Canal » : « Wave », « OM », « Orange Money », « cash », « espèces »… Vide → null ; illisible → "illisible". */
export function lireCanal(texte: string): CanalLu | null | "illisible" {
  const t = normaliserNom(texte).replace(/[.]/g, "");
  if (!t) return null;
  return CANAUX[t] ?? "illisible";
}
