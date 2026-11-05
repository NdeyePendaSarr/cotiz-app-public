"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { exigerUtilisatrice } from "@/lib/auth";
import { creerEcheancesDuCycle } from "@/lib/cycles/echeances";
import { listerPersonnesPourImport } from "@/lib/donnees/personnes";
import { analyserImport, lignesACompleter, resumer, STATUTS_IMPORTES, type Choix, type LigneAnalysee } from "@/lib/import/analyse";
import { detecterColonnes, extraireLignes, lireTableau, ROLES, type LigneEcartee, type Role } from "@/lib/import/tableau";
import { Canal, type TypeCaisse } from "@/lib/generated/prisma/enums";
import { avecDepenses } from "@/lib/depenses";
import { montantDuParMembre } from "@/lib/mensualite";
import { prisma } from "@/lib/prisma";
import { verrouillerEcheance } from "@/lib/verrous";
import { REPRISE } from "@/lib/paiements/origine";
import { schemaIdentifiant } from "@/lib/validation/caisse";

const TAILLE_MAX = 100_000; // caractères
const LIGNES_MAX = 500;

export type Apercu = {
  enTetes: string[];
  exemples: string[];
  roles: Role[];
  lignes: LigneAnalysee[];
  ecartees: LigneEcartee[];
  resume: ReturnType<typeof resumer>;
  choix: Choix;
  /** Canal choisi pour les paiements repris (colonne Versé). */
  canal: Canal | null;
};

export type EtatImport =
  | {
      erreur?: string;
      apercu?: Apercu;
      termine?: { importes: number; nouvelles: number; existantes: number; reactivations: number; verses: number; totalVerse: number; bonnesVolontes: number; canauxCorriges: number };
    }
  | undefined;

/**
 * Une seule action pour les deux boutons : « analyser » (aperçu, rien n'est écrit) et
 * « importer » (l'analyse est refaite côté serveur, puis tout est écrit en une transaction).
 */
export async function traiterImport(caisseId: string, _etat: EtatImport, formData: FormData): Promise<EtatImport> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Caisse introuvable." };

  const caisse = await prisma.caisse.findFirst({
    // Un compte gardé a son propre import (historique), sans membre : voir importerHistoriqueCompte.
    where: { id: idValide.data, ownerId, statut: "ACTIVE", type: { not: "COMPTE_GARDE" } },
    select: {
      id: true,
      type: true,
      montantCotisation: true,
      nombreMois: true,
      membres: { where: { statut: "ACTIF" }, select: { ordrePassage: true } },
      cycles: { where: { statut: "OUVERT" }, select: { id: true } },
    },
  });
  if (!caisse) return { erreur: "Caisse introuvable ou archivée." };

  const texte = z.string().max(TAILLE_MAX).safeParse(formData.get("texte"));
  if (!texte.success) return { erreur: "Liste trop longue (100 000 caractères maximum)." };
  const tableau = lireTableau(texte.data);
  if (tableau.lignes.length === 0) return { erreur: "Colle d'abord une liste." };
  if (tableau.lignes.length > LIGNES_MAX) return { erreur: `${LIGNES_MAX} lignes maximum par import.` };

  // Rôles des colonnes : ceux corrigés dans l'aperçu s'ils sont valides, sinon la détection.
  const detection = detecterColonnes(tableau);
  const corriges = tableau.lignes[0].cellules.map((_, j) => formData.get(`role-${j}`));
  if (corriges.every((r): r is Role => ROLES.includes(r as Role)) && corriges.length === tableau.nbColonnes) {
    detection.roles = corriges;
  }

  const choix: Choix = {};
  for (const [cle, valeur] of formData) {
    const m = /^choix-(\d+)$/.exec(cle);
    if (m && typeof valeur === "string") choix[Number(m[1])] = valeur;
  }

  const { lues, ecartees } = extraireLignes(tableau, detection);
  const existantes = await listerPersonnesPourImport(ownerId, caisse.id);
  const ordresPris = caisse.membres.map((m) => m.ordrePassage).filter((o): o is number => o !== null);
  const cycleOuvert = caisse.cycles[0] ?? null;
  // Membres dont l'échéance du cycle ouvert a déjà un paiement : leur versé sera ignoré.
  const dejaPayees = cycleOuvert
    ? (
        await prisma.echeance.findMany({
          where: { cycleId: cycleOuvert.id, allocations: { some: {} }, membre: { caisse: { ownerId } } },
          select: { membre: { select: { personneId: true } } },
        })
      ).map((e) => e.membre.personneId)
    : [];
  // Paiements créés par un import précédent sur ce cycle : le réimport peut corriger leur canal.
  const reprises = cycleOuvert
    ? Object.fromEntries(
        (
          await prisma.paiement.findMany({
            where: { ownerId, ...REPRISE, personneId: { not: null }, allocations: { some: { echeance: { cycleId: cycleOuvert.id } } } },
            select: { id: true, canal: true, personneId: true },
          })
        ).map((p) => [p.personneId!, { paiementId: p.id, canal: p.canal }]),
      )
    : {};
  const contexte = { type: caisse.type, ordresPris, cycleOuvert: Boolean(cycleOuvert), dejaPayees, reprises, montantCotisation: montantDuParMembre(caisse) };
  const lignes = analyserImport(lues, existantes, contexte, choix);
  const resume = resumer(lignes, contexte);

  const enTete = detection.ligneEnTete === null ? null : tableau.lignes[detection.ligneEnTete].cellules;
  const premiereDonnee = tableau.lignes.find((_, i) => i !== detection.ligneEnTete)?.cellules ?? [];
  const apercu: Apercu = {
    enTetes: detection.roles.map((_, j) => enTete?.[j] || `Colonne ${j + 1}`),
    exemples: detection.roles.map((_, j) => premiereDonnee[j] ?? ""),
    roles: detection.roles,
    lignes,
    ecartees,
    resume,
    choix,
    canal: null,
  };
  const canal = z.enum(Canal).safeParse(formData.get("canal"));
  if (canal.success) apercu.canal = canal.data;

  if (formData.get("intention") !== "importer") return { apercu };
  if (resume.aChoisir > 0) return { apercu, erreur: "Choisis d'abord pour chaque doublon possible." };
  // Un réimport peut ne rien inscrire mais compléter des cellules ou reprendre des versés.
  const aCompleter = lignesACompleter(lignes);
  if (resume.aImporter === 0 && aCompleter.length === 0) return { apercu, erreur: "Aucune ligne à importer." };
  if (resume.versesSansCanal > 0 && !apercu.canal) return { apercu, erreur: "Choisis le canal des paiements déjà versés." };

  const aImporter = lignes.filter((l) => STATUTS_IMPORTES.includes(l.statut));
  // Personne de chaque ligne, connue après l'écriture (les nouvelles sont créées dans la transaction).
  const personneDeLigne = new Map<number, string>();
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const l of aImporter) {
          if (l.statut === "reactivation" && l.personneId) {
            await tx.membreCaisse.update({
              where: { caisseId_personneId: { caisseId: caisse.id, personneId: l.personneId } },
              data: { statut: "ACTIF", ordrePassage: null },
            });
            personneDeLigne.set(l.numero, l.personneId);
            continue;
          }
          let personneId = l.personneId;
          if (l.statut === "nouvelle") {
            const creee = await tx.personne.create({
              data: {
                ownerId,
                nomComplet: l.nom,
                cellule: l.cellule,
                numeros: l.telephone ? { create: { ownerId, numero: l.telephone } } : undefined,
              },
              select: { id: true },
            });
            personneId = creee.id;
          }
          if (!personneId) throw new Error("Ligne sans personne");
          await tx.membreCaisse.create({ data: { caisseId: caisse.id, personneId, ordrePassage: l.ordre } });
          personneDeLigne.set(l.numero, personneId);
        }
        for (const l of aCompleter) if (l.personneId) personneDeLigne.set(l.numero, l.personneId);

        // Personne existante : la cellule complète une cellule vide (ne remplace jamais), et le
        // numéro de la liste est ajouté s'il n'est pas encore sur sa fiche (existante, réactivée ou déjà membre).
        for (const l of [...aImporter, ...aCompleter]) {
          const personneId = personneDeLigne.get(l.numero);
          if (l.statut === "nouvelle" || !personneId) continue;
          if (l.cellule) await tx.personne.updateMany({ where: { id: personneId, ownerId, cellule: null }, data: { cellule: l.cellule } });
          if (l.numeroAAjouter && l.telephone) {
            await tx.numeroPersonne.createMany({ data: [{ ownerId, personneId, numero: l.telephone }], skipDuplicates: true });
          }
        }
        // Cycle ouvert : une échéance pour chaque membre importé ou réactivé (en une requête ;
        // les échéances déjà existantes sont ignorées).
        const cycle = await tx.cycle.findFirst({ where: { caisseId: caisse.id, statut: "OUVERT" }, select: { id: true } });
        if (cycle) await creerEcheancesDuCycle(tx, cycle.id, caisse.id, montantDuParMembre(caisse));

        // Paiements déjà versés (colonne Versé) : un paiement rapproché par ligne, sur l'échéance
        // du cycle ouvert, avec son journal d'audit. Revérifié ici : jamais deux fois (réimport).
        // Canal : celui de la ligne (colonne « Canal »), sinon celui choisi pour l'import.
        if (cycle) {
          for (const l of lignes) {
            const personneId = personneDeLigne.get(l.numero);
            const canal = l.canal ?? apercu.canal;
            if (l.verse === null || !personneId || !canal) continue;
            await reprendreVerse(tx, { ownerId, caisse, cycleId: cycle.id, personneId, montant: l.verse, canal });
          }
        }

        // Réimport : canal corrigé sur les paiements repris d'un import précédent (montant inchangé).
        for (const l of lignes) {
          if (l.correctionCanal && l.personneId) await corrigerCanal(tx, ownerId, l.personneId, l.correctionCanal);
        }
      },
      { timeout: 30_000 },
    );
  } catch {
    // Par exemple : un membre ajouté entre l'aperçu et la confirmation. Rien n'a été écrit.
    return { apercu, erreur: "L'import a échoué et rien n'a été enregistré. Relance l'analyse puis réessaie." };
  }

  refresh();
  return {
    termine: {
      importes: aImporter.length,
      nouvelles: resume.nouvelles,
      existantes: resume.existantes,
      reactivations: resume.reactivations,
      verses: resume.verses,
      totalVerse: resume.totalVerse,
      bonnesVolontes: resume.bonnesVolontes,
      canauxCorriges: resume.canauxCorriges,
    },
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Paiement repris d'une liste importée : rapproché tout de suite sur l'échéance du membre,
 * plafonné au reste dû. Le surplus devient une bonne volonté dans une collecte, un excédent
 * « à rembourser » dans une tontine. Rien n'est créé si l'échéance a déjà un paiement.
 */
async function reprendreVerse(
  tx: Tx,
  p: { ownerId: string; caisse: { id: string; type: TypeCaisse }; cycleId: string; personneId: string; montant: number; canal: Canal },
) {
  const echeance = await tx.echeance.findFirst({
    where: { cycleId: p.cycleId, membre: { personneId: p.personneId, caisse: { ownerId: p.ownerId } } },
    select: { id: true, montantDu: true, membre: { select: { personne: { select: { nomComplet: true } } } } },
  });
  if (!echeance) return;
  // Verrou : une validation de rapprochement sur la même échéance attend la fin de l'import.
  await verrouillerEcheance(tx, p.ownerId, echeance.id);
  const deja = await tx.allocation.count({ where: { echeanceId: echeance.id } });
  if (deja > 0) return;

  const maintenant = new Date();
  const alloue = Math.min(p.montant, echeance.montantDu);
  const paiement = await tx.paiement.create({
    data: {
      ownerId: p.ownerId,
      canal: p.canal,
      source: "SAISIE_MANUELLE",
      montant: p.montant,
      dateReception: maintenant,
      personneId: p.personneId,
      origine: "REPRISE_IMPORT",
      datation: "NON_DATEE",
      statut: "RAPPROCHE",
      rapprocheLe: maintenant,
    },
    select: { id: true },
  });
  await tx.allocation.create({ data: { paiementId: paiement.id, echeanceId: echeance.id, montant: alloue } });
  await journaliser(tx, { ownerId: p.ownerId, entite: "Paiement", entiteId: paiement.id, action: "CREATION", details: { source: "REPRISE_IMPORT", canal: p.canal, montant: p.montant } });
  await journaliser(tx, { ownerId: p.ownerId, entite: "Paiement", entiteId: paiement.id, action: "MODIFICATION", details: { rapprochement: true, personneId: p.personneId, excedent: p.montant - alloue } });
  await journaliser(tx, { ownerId: p.ownerId, entite: "Allocation", entiteId: `${paiement.id}:${echeance.id}`, action: "CREATION", details: { montant: alloue } });

  const surplus = p.montant - alloue;
  if (surplus > 0 && avecDepenses(p.caisse.type)) {
    const donnees = {
      date: new Date(`${maintenant.toISOString().slice(0, 10)}T00:00:00.000Z`),
      montant: surplus,
      donateur: echeance.membre.personne.nomComplet.slice(0, 150),
      remisPar: null,
      canal: p.canal,
      note: NOTE_BONNE_VOLONTE,
    };
    const don = await tx.don.create({ data: { ownerId: p.ownerId, caisseId: p.caisse.id, paiementId: paiement.id, ...donnees }, select: { id: true } });
    await journaliser(tx, {
      ownerId: p.ownerId,
      entite: "Don",
      entiteId: don.id,
      action: "CREATION",
      details: { ...donnees, date: donnees.date.toISOString().slice(0, 10), paiementId: paiement.id, source: "REPRISE_IMPORT" },
    });
  }
}

/**
 * Corrige le canal d'un paiement repris d'un import précédent (et de la bonne volonté qui en est
 * issue). Revérifié ici : paiement de l'utilisatrice, de cette personne, créé par un import.
 */
async function corrigerCanal(tx: Tx, ownerId: string, personneId: string, c: { paiementId: string; de: Canal; vers: Canal }) {
  const { count } = await tx.paiement.updateMany({ where: { id: c.paiementId, ownerId, personneId, ...REPRISE, canal: c.de }, data: { canal: c.vers } });
  if (!count) return;
  await journaliser(tx, { ownerId, entite: "Paiement", entiteId: c.paiementId, action: "MODIFICATION", details: { canal: c.vers, ancienCanal: c.de, source: "REIMPORT" } });
  const don = await tx.don.findFirst({ where: { ownerId, paiementId: c.paiementId }, select: { id: true } });
  if (don) {
    await tx.don.update({ where: { id: don.id }, data: { canal: c.vers } });
    await journaliser(tx, { ownerId, entite: "Don", entiteId: don.id, action: "MODIFICATION", details: { canal: c.vers, ancienCanal: c.de, source: "REIMPORT" } });
  }
}

const NOTE_BONNE_VOLONTE = "Surplus du versé importé, gardé comme bonne volonté";
