// Comptes gardés (COMPTE_GARDE) : argent gardé pour une personne, sans échéance. Elle verse quand
// elle gagne, la trésorière lui rend une somme quand elle en a besoin. Solde = versé − retiré,
// négatif autorisé (avance de la trésorière). Fonctions pures, testées.

import { lireCanal, lireTableau, lireVerse, type CanalLu } from "@/lib/import/tableau";
import { normaliserNom } from "@/lib/texte";

export type Sens = "VERSEMENT" | "RETRAIT";
export type Mouvement = { date: Date; montant: number; sens: Sens };

export const LIBELLES_SENS: Record<Sens, string> = { VERSEMENT: "Versement", RETRAIT: "Retrait" };

/** Totaux d'un compte gardé : versé, retiré, solde (peut être négatif). */
export function soldeCompte(mouvements: Mouvement[]) {
  const verse = mouvements.reduce((s, m) => (m.sens === "VERSEMENT" ? s + m.montant : s), 0);
  const retire = mouvements.reduce((s, m) => (m.sens === "RETRAIT" ? s + m.montant : s), 0);
  return { verse, retire, solde: verse - retire, nombre: mouvements.length };
}

/** Solde après chaque jour qui a des mouvements, du plus ancien au plus récent (courbe du solde). */
export function courbeSolde(mouvements: Mouvement[]): { date: Date; solde: number }[] {
  const parJour = new Map<string, number>();
  for (const m of mouvements) {
    const cle = m.date.toISOString().slice(0, 10);
    parJour.set(cle, (parJour.get(cle) ?? 0) + (m.sens === "VERSEMENT" ? m.montant : -m.montant));
  }
  let solde = 0;
  return [...parJour.keys()].sort().map((cle) => {
    solde += parJour.get(cle)!;
    return { date: new Date(`${cle}T00:00:00.000Z`), solde };
  });
}

// ─── Import d'un historique collé (Word, Excel) ─────────────────────────────────

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  janv: 1, fev: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** « 12/03/2026 », « 12/03/26 », « 12-03-2026 », « 2026-03-12 », « 12 mars 2026 » → date (minuit UTC), sinon null. */
export function lireDate(texte: string): Date | null {
  const t = normaliserNom(texte).replace(/\./g, "/");
  let j: number, m: number, a: number;
  let x = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(t);
  if (x) [a, m, j] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(t))) [j, m, a] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{1,2})(?:er)? ([a-z]+) (\d{4})$/.exec(t)) && MOIS[x[2]]) [j, m, a] = [Number(x[1]), MOIS[x[2]], Number(x[3])];
  else return null;
  if (a < 100) a += 2000;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? d : null;
}

type RoleCompte = "date" | "versement" | "retrait" | "montant" | "sens" | "canal" | "note" | "ignorer";

// En-têtes reconnus (sans accents ni majuscules). « Reçu » = versé par la personne, « envoyé » = rendu.
const SYNONYMES: Record<Exclude<RoleCompte, "ignorer">, string[]> = {
  date: ["date", "jour", "le"],
  versement: ["versement", "verse", "versements", "recu", "reception", "entree", "entrees", "depot", "depots", "il m'a envoye", "credit"],
  retrait: ["retrait", "retraits", "retire", "sortie", "sorties", "envoye", "je lui ai envoye", "donne", "rendu", "debit"],
  montant: ["montant", "somme", "montant fcfa"],
  sens: ["sens", "type", "operation", "mouvement", "nature"],
  canal: ["canal", "moyen", "moyen de paiement", "mode", "mode de paiement", "via", "par"],
  note: ["note", "notes", "motif", "libelle", "commentaire", "observation", "objet", "details"],
};

/** Sens écrit dans une cellule : « versement », « reçu », « dépôt » → VERSEMENT ; « retrait », « envoyé », « sortie » → RETRAIT. */
export function lireSens(texte: string): Sens | null {
  const t = normaliserNom(texte);
  if (/^(versement|verse|recu|reception|depot|entree|credit|\+)/.test(t)) return "VERSEMENT";
  if (/^(retrait|retire|envoye|sortie|donne|rendu|debit|-)/.test(t)) return "RETRAIT";
  return null;
}

export type LigneCompte = {
  numero: number;
  texte: string;
  date: Date | null;
  sens: Sens | null;
  montant: number | null;
  canal: CanalLu | null;
  note: string | null;
  /** Ce qui empêche d'importer la ligne (date, montant ou sens illisible). */
  erreur: string | null;
};

export type AnalyseCompte = { roles: RoleCompte[]; enTete: boolean; lignes: LigneCompte[] };

/**
 * Lit un historique collé : une ligne par mouvement. Colonnes reconnues par leur en-tête : date,
 * versement et retrait (deux colonnes de montants), ou montant + sens, canal, note. Sans canal : null
 * (celui choisi à l'import). Les lignes de total sont ignorées.
 */
export function analyserHistoriqueCompte(texte: string): AnalyseCompte {
  const tableau = lireTableau(texte);
  const premiere = tableau.lignes[0]?.cellules ?? [];
  const roles: RoleCompte[] = premiere.map((c) => {
    const n = normaliserNom(c).replace(/[()]/g, "").trim();
    for (const role of Object.keys(SYNONYMES) as Exclude<RoleCompte, "ignorer">[]) if (SYNONYMES[role].includes(n)) return role;
    return "ignorer";
  });
  const enTete = roles.includes("date") && (roles.includes("montant") || roles.includes("versement") || roles.includes("retrait"));
  const lignes: LigneCompte[] = [];
  for (const ligne of tableau.lignes.slice(enTete ? 1 : 0)) {
    const val = (role: RoleCompte) => {
      const j = roles.indexOf(role);
      return j === -1 ? "" : (ligne.cellules[j] ?? "");
    };
    const texteLigne = ligne.cellules.filter(Boolean).join(" · ");
    if (ligne.cellules.some((c) => /^(montant )?(total|solde)\b/.test(normaliserNom(c)))) continue;

    const date = lireDate(val("date"));
    let sens: Sens | null = null;
    let montant: number | null = null;
    const versementLu = lireVerse(val("versement"));
    const retraitLu = lireVerse(val("retrait"));
    // Illisible (« 1.5 ») : signalé plus bas, jamais compté comme 0 sans le dire.
    const enVersement = versementLu ?? 0;
    const enRetrait = retraitLu ?? 0;
    if (enVersement > 0 && enRetrait === 0) [sens, montant] = ["VERSEMENT", enVersement];
    else if (enRetrait > 0 && enVersement === 0) [sens, montant] = ["RETRAIT", enRetrait];
    else if (roles.includes("montant")) {
      const m = lireVerse(val("montant"));
      montant = m && m > 0 ? m : null;
      sens = lireSens(val("sens"));
    }
    const canalLu = lireCanal(val("canal"));
    const note = val("note").trim().slice(0, 200) || null;

    let erreur: string | null = null;
    if (!enTete) erreur = "En-tête introuvable : la première ligne doit nommer les colonnes (Date, Versement, Retrait…).";
    else if (!date) erreur = `Date illisible « ${val("date")} ».`;
    else if (versementLu === null || retraitLu === null) erreur = `Montant illisible « ${versementLu === null ? val("versement") : val("retrait")} ».`;
    else if (enVersement > 0 && enRetrait > 0) erreur = "Versement et retrait sur la même ligne : sépare-les.";
    else if (!montant) erreur = "Montant illisible ou absent.";
    else if (!sens) erreur = "Sens illisible : versement ou retrait ?";

    lignes.push({ numero: ligne.numero, texte: texteLigne, date, sens, montant, canal: canalLu === "illisible" ? null : canalLu, note, erreur });
  }
  return { roles, enTete, lignes };
}

/** Clé d'un mouvement pour repérer un doublon déjà enregistré (même jour, même sens, même montant). */
export const cleMouvement = (m: { date: Date; sens: Sens; montant: number }) => `${m.date.toISOString().slice(0, 10)}|${m.sens}|${m.montant}`;
