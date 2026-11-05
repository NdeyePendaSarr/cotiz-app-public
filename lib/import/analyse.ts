// Classement des lignes d'une liste importée dans une caisse (aperçu avant enregistrement).
// Fonction pure : la Server Action la rejoue au moment de confirmer, sans faire confiance au navigateur.

import { formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { lireCanal, lireVerse, type CanalLu, type LigneLue } from "@/lib/import/tableau";
import { normaliserTelephone } from "@/lib/telephone";
import { nettoyerNom, normaliserNom } from "@/lib/texte";
import { chercherDoublons, type PersonneComparee } from "@/lib/validation/personne";
import { avecDepenses } from "@/lib/depenses";
import type { TypeCaisse } from "@/lib/generated/prisma/enums";

export type PersonneExistante = PersonneComparee & {
  /** Son inscription dans la caisse cible, si elle y est déjà. */
  membre?: { statut: "ACTIF" | "INACTIF" };
  /** Sa cellule (phase 10), pour distinguer deux homonymes. */
  cellule?: string | null;
};

/** Comparaison d'un champ entre la ligne de la liste et la fiche existante. */
export type Comparaison = "identique" | "different" | "inconnu";

/** Personne proposée quand il faut choisir, avec sa fiche pour décider en connaissance de cause. */
export type Candidat = {
  id: string;
  nomComplet: string;
  raison: "numero" | "nom";
  numeros: string[];
  cellule: string | null;
  /** Déjà membre active de la caisse où l'on importe. */
  membreDeLaCaisse: boolean;
  comparaison: { numero: Comparaison; cellule: Comparaison };
};

/**
 * Numéro et cellule de la ligne face à la fiche : « inconnu » quand l'un des deux côtés est vide
 * (rien à comparer), sinon identique ou différent (cellules comparées sans accents ni majuscules).
 */
export function comparerAvecFiche(ligne: { telephone: string | null; cellule: string | null }, fiche: { numeros: string[]; cellule: string | null }) {
  const numero: Comparaison = !ligne.telephone || fiche.numeros.length === 0 ? "inconnu" : fiche.numeros.includes(ligne.telephone) ? "identique" : "different";
  const cellule: Comparaison =
    !ligne.cellule || !fiche.cellule ? "inconnu" : normaliserNom(ligne.cellule) === normaliserNom(fiche.cellule) ? "identique" : "different";
  return { numero, cellule };
}

/** Deux lignes de même nom sont deux personnes si leurs numéros, ou leurs cellules, diffèrent. */
function distinctes(a: { telephone: string | null; cellule: string | null }, b: { telephone: string | null; cellule: string | null }) {
  const numerosDifferents = a.telephone !== null && b.telephone !== null && a.telephone !== b.telephone;
  const cellulesDifferentes = a.cellule !== null && b.cellule !== null && normaliserNom(a.cellule) !== normaliserNom(b.cellule);
  return numerosDifferents || cellulesDifferentes;
}

export type ContexteCaisse = {
  type: TypeCaisse;
  /** Ordres de passage déjà pris dans la caisse. */
  ordresPris: number[];
  /** Un cycle est ouvert : le versé peut y être enregistré (phase 10). */
  cycleOuvert?: boolean;
  /** Personnes dont l'échéance du cycle ouvert a déjà un paiement : leur versé est ignoré. */
  dejaPayees?: string[];
  /** Cotisation par membre : dans une collecte, le versé au-delà est une bonne volonté. */
  montantCotisation?: number;
  /**
   * Paiements créés par un import précédent (versé repris) sur le cycle ouvert, par personne :
   * un réimport peut corriger leur canal (jamais leur montant).
   */
  reprises?: Record<string, { paiementId: string; canal: CanalLu }>;
  /** Déjà affecté à l'échéance du cycle ouvert, par personne : un versé plus élevé est signalé. */
  dejaVerse?: Record<string, number>;
  /** Montants de versés repris annulés ou ignorés depuis, par personne : jamais recréés. */
  reprisesEnAttente?: Record<string, number[]>;
};

/** Choix de la trésorière pour une ligne à trancher : « creer » ou l'id d'une personne proposée. */
export type Choix = Record<number, string>;

export type Statut = "nouvelle" | "existante" | "a_choisir" | "deja_membre" | "reactivation" | "erreur";

export type LigneAnalysee = {
  numero: number;
  nom: string;
  telephone: string | null;
  ordre: number | null;
  /** Cellule de la commission (colonne « Cellule »), 50 caractères maximum. */
  cellule: string | null;
  /** Montant déjà versé à enregistrer comme paiement repris (null : rien à enregistrer). */
  verse: number | null;
  /** Canal du versé lu dans la liste (colonne « Canal ») ; null = celui choisi pour l'import. */
  canal: CanalLu | null;
  /** Réimport : canal d'un paiement repris d'un import précédent, à corriger. */
  correctionCanal?: { paiementId: string; de: CanalLu; vers: CanalLu };
  /** Personne existante qui n'a pas encore ce numéro : il lui sera ajouté. */
  numeroAAjouter?: boolean;
  statut: Statut;
  /** Personne existante utilisée (statuts existante, deja_membre, reactivation). */
  personneId?: string;
  /** Personnes proposées quand la trésorière doit choisir. */
  candidats: Candidat[];
  messages: string[];
};

export const LIBELLES_STATUT: Record<Statut, string> = {
  nouvelle: "Nouvelle personne",
  existante: "Personne existante",
  a_choisir: "Doublon possible : à choisir",
  deja_membre: "Déjà membre (complété)",
  reactivation: "Membre inactif : réactivé",
  erreur: "Erreur : ignorée",
};

/** Lignes qui seront réellement enregistrées. */
export const STATUTS_IMPORTES: Statut[] = ["nouvelle", "existante", "reactivation"];

/** Membres déjà inscrits que le réimport complète (cellule, numéro ou versé). */
export function lignesACompleter(lignes: LigneAnalysee[]) {
  return lignes.filter((l) => l.statut === "deja_membre" && (l.verse !== null || l.cellule || l.numeroAAjouter || l.correctionCanal));
}

export function analyserImport(
  lues: LigneLue[],
  existantes: PersonneExistante[],
  caisse: ContexteCaisse,
  choix: Choix = {},
): LigneAnalysee[] {
  const parId = new Map(existantes.map((p) => [p.id, p]));
  const vusNom = new Map<string, { numero: number; telephone: string | null; cellule: string | null }[]>();
  const vusTelephone = new Map<string, number>();
  const vuesPersonnes = new Map<string, number>();

  // 1. Identification de chaque ligne.
  const lignes: LigneAnalysee[] = lues.map((l) => {
    const nom = nettoyerNom(l.nom).slice(0, 150);
    const cellule = nettoyerNom(l.celluleSaisie ?? "").slice(0, 50) || null;
    const base: LigneAnalysee = { numero: l.numero, nom, telephone: null, ordre: null, cellule, verse: null, canal: null, statut: "nouvelle", candidats: [], messages: [] };
    const erreur = (message: string): LigneAnalysee => ({ ...base, statut: "erreur", messages: [message] });

    if (l.telephoneSaisi) {
      base.telephone = normaliserTelephone(l.telephoneSaisi);
      if (!base.telephone) return erreur(`Numéro illisible : « ${l.telephoneSaisi} » (9 chiffres attendus).`);
      const avant = vusTelephone.get(base.telephone);
      if (avant) return erreur(`Même numéro qu'à la ligne ${avant}.`);
      vusTelephone.set(base.telephone, l.numero);
    }
    // Même nom dans la liste : deux personnes différentes si le numéro ou la cellule les
    // distingue (homonymes, phase 10) ; sinon, c'est sans doute la même personne écrite deux fois.
    const cleNom = normaliserNom(nom);
    const memesNoms = vusNom.get(cleNom) ?? [];
    const confondue = memesNoms.find((autre) => !distinctes(autre, { telephone: base.telephone, cellule }));
    if (confondue) return erreur(`Même nom qu'à la ligne ${confondue.numero}, sans numéro ni cellule différents.`);
    vusNom.set(cleNom, [...memesNoms, { numero: l.numero, telephone: base.telephone, cellule }]);

    const doublons = chercherDoublons({ nomComplet: nom, numeros: base.telephone ? [base.telephone] : [] }, existantes);
    // Chaque personne proposée vient avec sa fiche et ce qui la rapproche ou la distingue de la ligne.
    const candidat = (id: string, nomComplet: string, raison: "numero" | "nom"): Candidat => {
      const fiche = parId.get(id);
      return {
        id,
        nomComplet,
        raison,
        numeros: fiche?.numeros ?? [],
        cellule: fiche?.cellule ?? null,
        membreDeLaCaisse: fiche?.membre?.statut === "ACTIF",
        comparaison: comparerAvecFiche({ telephone: base.telephone, cellule }, { numeros: fiche?.numeros ?? [], cellule: fiche?.cellule ?? null }),
      };
    };
    const candidats = [
      ...doublons.memeNumero.map((d) => candidat(d.personne.id, d.personne.nomComplet, "numero")),
      ...doublons.memeNom.map((p) => candidat(p.id, p.nomComplet, "nom")),
    ];

    // Même numéro qu'une seule personne : c'est elle (décision du cahier, phase 4).
    // Même nom qu'une seule personne déjà membre active de CETTE caisse, sans autre candidat :
    // c'est elle aussi (réimport de la liste de la caisse, phase 10) ; sinon, la trésorière choisit.
    // Jamais si le numéro ou la cellule de la ligne contredit la fiche : ce serait fusionner deux homonymes.
    let personneId: string | undefined;
    const homonyme = doublons.memeNom.length === 1 ? parId.get(doublons.memeNom[0].id) : undefined;
    const contredit =
      homonyme !== undefined &&
      ((base.telephone !== null && homonyme.numeros.length > 0 && !homonyme.numeros.includes(base.telephone)) ||
        (cellule !== null && Boolean(homonyme.cellule) && normaliserNom(cellule) !== normaliserNom(homonyme.cellule ?? "")));
    if (contredit && doublons.memeNumero.length === 0) {
      base.messages = [...base.messages, "Même nom qu'une personne existante, mais numéro ou cellule différents : sans doute une autre personne."];
    }
    const seulMembreDuMemeNom = doublons.memeNumero.length === 0 && homonyme?.membre?.statut === "ACTIF" && !contredit;
    if (doublons.memeNumero.length === 1) personneId = doublons.memeNumero[0].personne.id;
    else if (seulMembreDuMemeNom && choix[l.numero] !== "creer") personneId = doublons.memeNom[0].id;
    else if (candidats.length > 0) {
      const choisi = choix[l.numero];
      if (choisi === "creer") return { ...base, candidats };
      if (choisi && candidats.some((c) => c.id === choisi)) personneId = choisi;
      else return { ...base, statut: "a_choisir", candidats };
    }
    if (!personneId) return base;

    const deja = vuesPersonnes.get(personneId);
    if (deja) return erreur(`Même personne qu'à la ligne ${deja}.`);
    vuesPersonnes.set(personneId, l.numero);

    // Numéro de la liste que la personne existante n'a pas encore : il lui sera ajouté (phase 10).
    const existante = parId.get(personneId);
    if (base.telephone && existante && !existante.numeros.includes(base.telephone)) {
      base.numeroAAjouter = true;
      base.messages = [...base.messages, "Numéro ajouté à sa fiche."];
    }

    const membre = existante?.membre;
    if (membre?.statut === "ACTIF") return { ...base, statut: "deja_membre", personneId, candidats };
    if (membre?.statut === "INACTIF") {
      return { ...base, statut: "reactivation", personneId, candidats, messages: ["Réactivé sans ordre de passage.", ...base.messages] };
    }
    return { ...base, statut: "existante", personneId, candidats };
  });

  // 2. Ordres de passage (tontines seulement ; une collecte n'en a pas).
  if (caisse.type === "TONTINE") attribuerOrdres(lignes, lues, caisse.ordresPris);
  // 3. Montant déjà versé (phase 10).
  attribuerVerses(lignes, lues, caisse);
  return lignes;
}

/** Statuts dont le versé peut être enregistré : le membre est (ou sera) actif dans la caisse. */
const STATUTS_AVEC_VERSE: Statut[] = ["nouvelle", "existante", "reactivation", "deja_membre"];

/**
 * Versé > 0 → paiement repris sur l'échéance du cycle ouvert, sauf : pas de cycle ouvert,
 * ou échéance déjà payée dans Cotiz (on ne compte jamais deux fois : réimport possible). Dans ce
 * dernier cas, si ce paiement vient d'un import précédent et que la liste donne un autre canal,
 * seul son canal est corrigé.
 * Collecte : ce qui dépasse la cotisation devient une bonne volonté (signalé sur la ligne).
 */
function attribuerVerses(lignes: LigneAnalysee[], lues: LigneLue[], caisse: ContexteCaisse) {
  const saisi = new Map(lues.map((l) => [l.numero, l.verseSaisi ?? ""]));
  const canalSaisi = new Map(lues.map((l) => [l.numero, l.canalSaisi ?? ""]));
  const dejaPayees = new Set(caisse.dejaPayees ?? []);
  for (const ligne of lignes) {
    const texte = saisi.get(ligne.numero) ?? "";
    if (!texte || !STATUTS_AVEC_VERSE.includes(ligne.statut)) continue;
    const montant = lireVerse(texte);
    if (montant === null) ligne.messages.push(`Versé illisible « ${texte} » : ignoré.`);
    else if (montant === 0) continue;
    else if (!caisse.cycleOuvert) ligne.messages.push("Pas de cycle ouvert : versé ignoré.");
    else if (ligne.personneId && dejaPayees.has(ligne.personneId)) {
      const reprise = caisse.reprises?.[ligne.personneId];
      const canal = lireCanal(canalSaisi.get(ligne.numero) ?? "");
      if (reprise && canal && canal !== "illisible" && canal !== reprise.canal) {
        ligne.correctionCanal = { paiementId: reprise.paiementId, de: reprise.canal, vers: canal };
        ligne.messages.push(`Déjà repris d'un import : canal corrigé, ${LIBELLES_CANAL[reprise.canal]} → ${LIBELLES_CANAL[canal]}.`);
      } else ligne.messages.push("Déjà un paiement dans Cotiz : versé ignoré.");
      // La liste annonce plus que Cotiz : rien n'est créé, la trésorière saisit la différence si elle l'a reçue.
      const connu = caisse.dejaVerse?.[ligne.personneId] ?? 0;
      if (caisse.dejaVerse && montant > connu) {
        ligne.messages.push(`La liste indique ${formaterFCFA(montant)}, Cotiz connaît ${formaterFCFA(connu)} : saisis les ${formaterFCFA(montant - connu)} d'écart s'ils ont bien été reçus.`);
      }
    } else if (ligne.personneId && caisse.reprisesEnAttente?.[ligne.personneId]?.includes(montant)) {
      ligne.messages.push("Ce versé repris a été annulé ou ignoré : il attend au rapprochement, versé ignoré.");
    } else {
      ligne.verse = montant;
      const texteCanal = canalSaisi.get(ligne.numero) ?? "";
      const canal = lireCanal(texteCanal);
      if (canal === "illisible") ligne.messages.push(`Canal illisible « ${texteCanal} » : celui choisi pour l'import.`);
      else ligne.canal = canal;
      const surplus = avecDepenses(caisse.type) && caisse.montantCotisation ? montant - caisse.montantCotisation : 0;
      if (surplus > 0) ligne.messages.push(`Dont ${formaterFCFA(surplus)} en bonne volonté.`);
    }
  }
}

/**
 * Ordre saisi libre → gardé. Ordre saisi déjà pris → membre importé sans ordre (à attribuer
 * à la main). Pas d'ordre saisi → ordre des lignes, à la suite des membres existants.
 */
function attribuerOrdres(lignes: LigneAnalysee[], lues: LigneLue[], ordresPris: number[]) {
  const pris = new Set(ordresPris);
  const aOrdonner = lignes.filter((l) => l.statut === "nouvelle" || l.statut === "existante");
  const saisi = new Map(lues.map((l) => [l.numero, l.ordreSaisi]));

  const sansOrdre: LigneAnalysee[] = [];
  for (const ligne of aOrdonner) {
    const texte = saisi.get(ligne.numero) ?? "";
    if (!texte) {
      sansOrdre.push(ligne);
      continue;
    }
    const ordre = /^\d{1,3}$/.test(texte) ? Number(texte) : 0;
    if (ordre < 1) {
      ligne.messages.push(`Ordre illisible « ${texte} » : importé sans ordre.`);
    } else if (pris.has(ordre)) {
      ligne.messages.push(`Ordre ${ordre} déjà pris : importé sans ordre.`);
    } else {
      ligne.ordre = ordre;
      pris.add(ordre);
    }
  }
  let suivant = Math.max(0, ...pris) + 1;
  for (const ligne of sansOrdre) ligne.ordre = suivant++;
}

export function resumer(lignes: LigneAnalysee[], caisse?: Pick<ContexteCaisse, "type" | "montantCotisation">) {
  const cotisation = caisse && avecDepenses(caisse.type) ? (caisse.montantCotisation ?? 0) : 0;
  const compte = (s: Statut) => lignes.filter((l) => l.statut === s).length;
  return {
    total: lignes.length,
    aImporter: lignes.filter((l) => STATUTS_IMPORTES.includes(l.statut)).length,
    nouvelles: compte("nouvelle"),
    existantes: compte("existante"),
    reactivations: compte("reactivation"),
    aChoisir: compte("a_choisir"),
    dejaMembres: compte("deja_membre"),
    erreurs: compte("erreur"),
    /** Paiements repris (phase 10) : nombre et total. */
    verses: lignes.filter((l) => l.verse !== null).length,
    totalVerse: lignes.reduce((s, l) => s + (l.verse ?? 0), 0),
    /** Versés sans canal dans la liste : ils prennent le canal choisi pour l'import (obligatoire s'il y en a). */
    versesSansCanal: lignes.filter((l) => l.verse !== null && l.canal === null).length,
    /** Réimport : paiements repris d'un import précédent dont le canal sera corrigé. */
    canauxCorriges: lignes.filter((l) => l.correctionCanal).length,
    /** Collecte : part des versés au-delà de la cotisation, enregistrée en bonnes volontés. */
    bonnesVolontes: cotisation > 0 ? lignes.reduce((s, l) => s + Math.max(0, (l.verse ?? 0) - cotisation), 0) : 0,
  };
}
