// Parser des SMS Wave de réception. Contrat : CAHIER_DES_CHARGES.md, section « Format SMS Wave ».
//
// Principes :
// 1. La ligne « Nouveau solde » est retirée en tout premier : le solde n'est jamais lu.
// 2. Le texte est normalisé (fins de ligne, espaces spéciaux, caractères invisibles).
// 3. Chaque champ est cherché séparément : s'il en manque un, les autres sont quand même lus.
// 4. Aucune exception : tout cas imprévu donne { ok: false, raison }.

import { normaliserTelephone } from "@/lib/telephone";

/** Champs facultatifs : s'ils manquent, le SMS est quand même lu (ok: true). */
export type ChampFacultatif = "nom" | "telephone" | "reference";

export type ResultatParsing =
  | {
      ok: true;
      montant: number;
      nomExpediteur: string | null;
      telephoneExpediteur: string | null;
      dateReception: Date;
      reference: string | null;
      champsManquants: ChampFacultatif[];
    }
  | { ok: false; raison: string };

// Caractères invisibles laissés par certains copier-coller (iPhone, WhatsApp).
const INVISIBLES = /[​-‍⁠﻿]/g;
// Espaces « spéciaux » à traiter comme une espace normale.
const ESPACES_SPECIAUX = /[   \t]/g;
// Début de la ligne de réception : « Vous avez recu » (sans cédille chez Wave) ou « reçu ».
const DEBUT_RECEPTION = /^vous avez re[cç]u\b/gim;

/** Retire la ligne « Nouveau solde » avant tout traitement ou stockage. */
export function retirerLigneSolde(texte: string): string {
  if (typeof texte !== "string") return "";
  // Ligne entière, fin de ligne comprise ; tolère espaces (même insécables) et casse.
  return texte.replace(/^(?:[^\S\r\n]|[​-‍﻿])*nouveau\s+solde[^\r\n]*(?:\r?\n|$)/gim, "");
}

/** Lit un SMS Wave de réception. Ne lève jamais d'exception. */
export function parserSmsWave(texte: string): ResultatParsing {
  try {
    return lire(texte);
  } catch {
    return { ok: false, raison: "SMS illisible." };
  }
}

function lire(texte: string): ResultatParsing {
  if (typeof texte !== "string") return { ok: false, raison: "Le texte est vide." };

  const lignes = normaliser(retirerLigneSolde(texte));
  if (lignes.length === 0) return { ok: false, raison: "Le texte est vide." };
  const sms = lignes.join("\n");

  const nbReceptions = sms.match(DEBUT_RECEPTION)?.length ?? 0;
  if (nbReceptions === 0) return { ok: false, raison: "Ce texte n'est pas un SMS de réception Wave." };
  if (nbReceptions > 1) return { ok: false, raison: `${nbReceptions} SMS détectés, colle-les un par un` };

  // Champs obligatoires.
  const montant = lireMontant(sms);
  if (montant === null) return { ok: false, raison: "Montant illisible." };
  const dateReception = lireDate(sms);
  if (dateReception === null) return { ok: false, raison: "Date ou heure illisible." };

  // Champs facultatifs.
  const { nom, telephone } = lireExpediteur(sms);
  const reference = lireReference(lignes);

  const champsManquants: ChampFacultatif[] = [];
  if (nom === null) champsManquants.push("nom");
  if (telephone === null) champsManquants.push("telephone");
  if (reference === null) champsManquants.push("reference");

  return { ok: true, montant, nomExpediteur: nom, telephoneExpediteur: telephone, dateReception, reference, champsManquants };
}

/** Une ligne propre par ligne de texte : espaces réduits, lignes vides retirées. */
function normaliser(texte: string): string[] {
  return texte
    .replace(INVISIBLES, "")
    .replace(ESPACES_SPECIAUX, " ")
    .split(/\r\n|\r|\n/)
    .map((ligne) => ligne.replace(/ {2,}/g, " ").trim())
    .filter((ligne) => ligne !== "");
}

/** « Vous avez recu 1.250.000F » → 1250000. Le point est le séparateur de milliers. */
function lireMontant(sms: string): number | null {
  const m = /^vous avez re[cç]u (\d{1,3}(?:\.\d{3})+|\d+) ?F\b/im.exec(sms);
  if (!m) return null;
  const montant = Number(m[1].replaceAll(".", ""));
  return Number.isSafeInteger(montant) && montant > 0 ? montant : null;
}

/** « 27/10/2026 à 15h07 » → Date. Heure de Dakar = UTC+0, donc Date.UTC directement. */
function lireDate(sms: string): Date | null {
  const m = /\b(\d{2})\/(\d{2})\/(\d{4}) (?:à|a) (\d{1,2})h(\d{2})\b/i.exec(sms);
  if (!m) return null;
  const [jour, mois, annee, heure, minute] = m.slice(1).map(Number);
  if (heure > 23 || minute > 59) return null;

  const date = new Date(Date.UTC(annee, mois - 1, jour, heure, minute));
  // Date.UTC « corrige » silencieusement un 31/02 en 03/03 : on le refuse.
  const coherente = date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
  return coherente ? date : null;
}

/** « De <nom> (<numéro>) » ; le numéro peut être renvoyé à la ligne suivante. */
function lireExpediteur(sms: string): { nom: string | null; telephone: string | null } {
  const avecNumero = /^De (?:([^\n(]*?) ?)?\n?\(([^)\n]*)\)/m.exec(sms);
  if (avecNumero) {
    return { nom: nettoyerNom(avecNumero[1]), telephone: normaliserTelephone(avecNumero[2]) };
  }
  const sansNumero = /^De (.+)$/m.exec(sms);
  return { nom: nettoyerNom(sansNumero?.[1]), telephone: null };
}

function nettoyerNom(nom: string | undefined): string | null {
  const propre = nom?.trim();
  return propre ? propre.slice(0, 150) : null; // Paiement.nomExpediteur : VarChar(150)
}

/** Référence de transaction : 17 caractères, majuscules et chiffres, seule sur sa ligne (la dernière trouvée). */
function lireReference(lignes: string[]): string | null {
  const candidates = lignes.filter((ligne) => /^(?=.*[A-Z])[A-Z0-9]{17}$/.test(ligne));
  return candidates.at(-1) ?? null;
}
