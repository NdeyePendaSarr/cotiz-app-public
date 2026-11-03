"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { echeancesDues, personnesPourMatching } from "@/lib/donnees/rapprochement";
import type { Prisma } from "@/lib/generated/prisma/client";
import { verifierRepartition, type Ligne } from "@/lib/matching/allocation";
import { identifierPersonne } from "@/lib/matching/personne";
import { REPRISE } from "@/lib/paiements/origine";
import { MAX_VALIDATION_GROUPEE, repartitionSure } from "@/lib/matching/surete";
import { verrouillerEcheancesDePersonne, verrouillerPaiement } from "@/lib/verrous";
import { prisma } from "@/lib/prisma";
import { normaliserNom } from "@/lib/texte";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { MAX_ALIAS, MAX_NUMEROS } from "@/lib/validation/personne";

export type EtatRapprochement = { erreur?: string } | undefined;

/** Erreur métier levée dans la transaction : la transaction est annulée et le message affiché. */
class RefusRapprochement extends Error {}

/** Lignes « ligne-<echeanceId> = montant » du formulaire. */
function lireLignes(formData: FormData): Ligne[] | null {
  const lignes: Ligne[] = [];
  for (const [cle, valeur] of formData) {
    const m = /^ligne-(.+)$/.exec(cle);
    if (!m || typeof valeur !== "string" || valeur.trim() === "") continue;
    if (!schemaIdentifiant.safeParse(m[1]).success || !/^\d+$/.test(valeur.trim())) return null;
    const montant = Number(valeur.trim());
    if (montant > 0) lignes.push({ echeanceId: m[1], montant });
  }
  return lignes;
}

/**
 * Valide un rapprochement : personne + répartition, en une transaction. Tout est revérifié
 * ici, au moment d'écrire (le navigateur n'a fait que proposer) : appartenance, reste dû
 * actuel de chaque échéance (plafond), somme ≤ montant du paiement.
 */
export async function validerRapprochement(paiementId: string, _etat: EtatRapprochement, formData: FormData): Promise<EtatRapprochement> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idPaiement = schemaIdentifiant.safeParse(paiementId);
  const idPersonne = schemaIdentifiant.safeParse(formData.get("personneId"));
  if (!idPaiement.success) return { erreur: "Paiement introuvable." };
  if (!idPersonne.success) return { erreur: "Choisis d'abord la personne." };
  const lignes = lireLignes(formData);
  if (!lignes) return { erreur: "Montants invalides." };

  try {
    await prisma.$transaction(async (tx) => {
      // Verrou : une 2e validation simultanée du même paiement attend, puis voit qu'il est traité.
      if (!(await verrouillerPaiement(tx, ownerId, idPaiement.data, ["A_RAPPROCHER"]))) throw new RefusRapprochement("Ce paiement a déjà été traité.");
      const paiement = await tx.paiement.findFirst({ where: { id: idPaiement.data, ownerId, statut: "A_RAPPROCHER" } });
      if (!paiement) throw new RefusRapprochement("Ce paiement a déjà été traité.");
      const personne = await tx.personne.findFirst({
        where: { id: idPersonne.data, ownerId },
        select: { id: true, nomComplet: true, aliasWave: true, numeros: { select: { numero: true } } },
      });
      if (!personne) throw new RefusRapprochement("Personne introuvable.");

      // Reste dû recalculé maintenant, dans la transaction (plafond, cahier phase 7), après avoir
      // verrouillé les échéances de la personne : aucun autre paiement ne peut s'y glisser entre-temps.
      await verrouillerEcheancesDePersonne(tx, ownerId, personne.id);
      const dues = (await echeancesDues(tx, ownerId, personne.id))[personne.id] ?? [];
      const probleme = verifierRepartition(paiement.montant, lignes, dues);
      if (probleme) throw new RefusRapprochement(probleme);

      await ecrireRapprochement(tx, ownerId, paiement, personne.id, lignes);

      // Mémoriser pour la prochaine fois (cases cochées) : le numéro, ou le nom Wave comme alias.
      const tel = paiement.telephoneExpediteur;
      if (formData.get("enregistrerNumero") === "on" && tel && !personne.numeros.some((n) => n.numero === tel) && personne.numeros.length < MAX_NUMEROS) {
        await tx.numeroPersonne.create({ data: { ownerId, personneId: personne.id, numero: tel } });
      }
      const nomWave = paiement.nomExpediteur?.trim();
      const dejaConnu = nomWave && [personne.nomComplet, ...personne.aliasWave].some((n) => normaliserNom(n) === normaliserNom(nomWave));
      if (formData.get("enregistrerAlias") === "on" && nomWave && !dejaConnu && personne.aliasWave.length < MAX_ALIAS) {
        await tx.personne.update({ where: { id: personne.id }, data: { aliasWave: { push: nomWave } } });
      }
    });
  } catch (e) {
    if (e instanceof RefusRapprochement) return { erreur: e.message };
    throw e;
  }
  await annoncer("Paiement rapproché ✓");
  refresh();
}

/** Écrit un rapprochement déjà vérifié : allocations, paiement rapproché, journal d'audit. */
async function ecrireRapprochement(
  tx: Prisma.TransactionClient,
  ownerId: string,
  paiement: { id: string; montant: number },
  personneId: string,
  lignes: Ligne[],
  groupe = false,
) {
  // Passage de statut conditionnel : si le paiement n'est plus « à rapprocher », rien n'est écrit.
  const { count } = await tx.paiement.updateMany({
    where: { id: paiement.id, ownerId, statut: "A_RAPPROCHER" },
    data: { personneId, statut: "RAPPROCHE", rapprocheLe: new Date() },
  });
  if (count !== 1) throw new RefusRapprochement("Ce paiement a déjà été traité.");
  await tx.allocation.createMany({ data: lignes.map((l) => ({ paiementId: paiement.id, echeanceId: l.echeanceId, montant: l.montant })) });
  const excedent = paiement.montant - lignes.reduce((s, l) => s + l.montant, 0);
  await journaliser(tx, {
    ownerId,
    entite: "Paiement",
    entiteId: paiement.id,
    action: "MODIFICATION",
    details: { rapprochement: true, personneId, excedent, ...(groupe && { validationGroupee: true }) },
  });
  for (const l of lignes) {
    await journaliser(tx, { ownerId, entite: "Allocation", entiteId: `${paiement.id}:${l.echeanceId}`, action: "CREATION", details: { montant: l.montant } });
  }
}

const schemaPaiementsSurs = z.array(schemaIdentifiant).min(1).max(MAX_VALIDATION_GROUPEE);

/**
 * Valide d'un coup les paiements « sûrs » (lot 4). Le navigateur n'envoie que des identifiants :
 * pour chacun, tout est refait ici, dans sa propre transaction (personne, reste dû relu,
 * répartition, revérification). Un paiement qui n'est plus sûr (traité entre-temps, autre
 * paiement passé avant sur la même échéance…) est laissé de côté, sans erreur.
 */
export async function validerSurs(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const ids = schemaPaiementsSurs.safeParse(formData.getAll("paiementId"));
  if (!ids.success) return;
  const personnes = await personnesPourMatching(ownerId);
  // Les SMS passent avant les versés repris d'une liste importée : quand les deux couvrent la même
  // cotisation, on garde le SMS (vraie date, vrai canal) et le versé repris reste « à vérifier ».
  const reprises = new Set(
    (await prisma.paiement.findMany({ where: { id: { in: ids.data }, ownerId, ...REPRISE }, select: { id: true } })).map((p) => p.id),
  );
  const ordre = [...new Set(ids.data)].sort((a, b) => Number(reprises.has(a)) - Number(reprises.has(b)));

  let valides = 0;
  for (const id of ordre) {
    const fait = await prisma.$transaction(async (tx) => {
      if (!(await verrouillerPaiement(tx, ownerId, id, ["A_RAPPROCHER"]))) return false;
      const paiement = await tx.paiement.findFirst({ where: { id, ownerId, statut: "A_RAPPROCHER" } });
      if (!paiement) return false;
      const identification = identifierPersonne(paiement, personnes);
      if (!identification.proposee) return false;
      await verrouillerEcheancesDePersonne(tx, ownerId, identification.proposee);
      const dues = (await echeancesDues(tx, ownerId, identification.proposee))[identification.proposee] ?? [];
      const repartition = repartitionSure(identification, paiement.montant, dues);
      if (!repartition || verifierRepartition(paiement.montant, repartition.lignes, dues)) return false;
      await ecrireRapprochement(tx, ownerId, paiement, identification.proposee, repartition.lignes, true);
      return true;
    });
    if (fait) valides++;
  }

  const laisses = ordre.length - valides;
  await annoncer(
    `${valides} paiement${valides > 1 ? "s" : ""} rapproché${valides > 1 ? "s" : ""} ✓` +
      (laisses > 0 ? ` · ${laisses} à vérifier un par un` : ""),
  );
  refresh();
}

/**
 * Verse tout un paiement sur le compte gardé de la personne (argent qu'elle confie, pas une
 * cotisation) : paiement rapproché à cette personne, un versement créé sur son compte, journalisés
 * ensemble. Revérifié ici : paiement à rapprocher, compte actif dont la personne est titulaire.
 */
export async function verserSurCompte(paiementId: string, _etat: EtatRapprochement, formData: FormData): Promise<EtatRapprochement> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idPaiement = schemaIdentifiant.safeParse(paiementId);
  const idPersonne = schemaIdentifiant.safeParse(formData.get("personneId"));
  const idCompte = schemaIdentifiant.safeParse(formData.get("compteId"));
  if (!idPaiement.success) return { erreur: "Paiement introuvable." };
  if (!idPersonne.success) return { erreur: "Choisis d'abord la personne." };
  if (!idCompte.success) return { erreur: "Choisis le compte." };

  try {
    await prisma.$transaction(async (tx) => {
      if (!(await verrouillerPaiement(tx, ownerId, idPaiement.data, ["A_RAPPROCHER"]))) throw new RefusRapprochement("Ce paiement a déjà été traité.");
      const paiement = await tx.paiement.findFirst({ where: { id: idPaiement.data, ownerId, statut: "A_RAPPROCHER" }, select: { id: true, montant: true, canal: true, dateReception: true } });
      if (!paiement) throw new RefusRapprochement("Ce paiement a déjà été traité.");
      const compte = await tx.caisse.findFirst({
        where: { id: idCompte.data, ownerId, type: "COMPTE_GARDE", statut: "ACTIVE", membres: { some: { personneId: idPersonne.data } } },
        select: { id: true, nom: true },
      });
      if (!compte) throw new RefusRapprochement("Ce compte n'est pas celui de cette personne.");

      const { count } = await tx.paiement.updateMany({
        where: { id: paiement.id, ownerId, statut: "A_RAPPROCHER" },
        data: { personneId: idPersonne.data, statut: "RAPPROCHE", rapprocheLe: new Date() },
      });
      if (count !== 1) throw new RefusRapprochement("Ce paiement a déjà été traité.");
      const date = new Date(`${paiement.dateReception.toISOString().slice(0, 10)}T00:00:00.000Z`);
      const m = await tx.mouvementCompte.create({
        data: { ownerId, caisseId: compte.id, date, montant: paiement.montant, sens: "VERSEMENT", canal: paiement.canal, paiementId: paiement.id },
        select: { id: true },
      });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: paiement.id, action: "MODIFICATION", details: { rapprochement: true, personneId: idPersonne.data, compte: compte.nom } });
      await journaliser(tx, {
        ownerId,
        entite: "MouvementCompte",
        entiteId: m.id,
        action: "CREATION",
        details: { date: date.toISOString().slice(0, 10), montant: paiement.montant, sens: "VERSEMENT", canal: paiement.canal, paiementId: paiement.id },
      });
    });
  } catch (e) {
    if (e instanceof RefusRapprochement) return { erreur: e.message };
    throw e;
  }
  await annoncer("Versé sur le compte ✓");
  refresh();
}

const lirePaiementId = (formData: FormData) => schemaIdentifiant.safeParse(formData.get("paiementId"));

/** Paiement sans rapport avec les tontines. Réversible (« Remettre à rapprocher »). */
export async function ignorerPaiement(formData: FormData) {
  await changerStatut(formData, "A_RAPPROCHER", "IGNORE");
}

export async function remettreARapprocher(formData: FormData) {
  await changerStatut(formData, "IGNORE", "A_RAPPROCHER");
}

async function changerStatut(formData: FormData, depuis: "A_RAPPROCHER" | "IGNORE", vers: "A_RAPPROCHER" | "IGNORE") {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = lirePaiementId(formData);
  if (!id.success) return;
  await prisma.$transaction(async (tx) => {
    // Un SMS qui a daté un versé repris (le même argent) ne revient jamais « à rapprocher ».
    const datant = vers === "A_RAPPROCHER" ? { dateRepriseId: null } : {};
    const { count } = await tx.paiement.updateMany({ where: { id: id.data, ownerId, statut: depuis, ...datant }, data: { statut: vers } });
    if (count) await journaliser(tx, { ownerId, entite: "Paiement", entiteId: id.data, action: "MODIFICATION", details: { statut: vers } });
  });
  await annoncer(vers === "IGNORE" ? "Paiement ignoré" : "Paiement remis à rapprocher");
  refresh();
}

/**
 * Annule un rapprochement : supprime ses allocations (tracé) et remet le paiement « à
 * rapprocher ». Seulement si toutes ses échéances sont dans des cycles encore ouverts.
 */
export async function annulerRapprochement(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = lirePaiementId(formData);
  if (!id.success) return;
  const refus = await prisma.$transaction(async (tx): Promise<string | null> => {
    if (!(await verrouillerPaiement(tx, ownerId, id.data, ["RAPPROCHE"]))) return null;
    const paiement = await tx.paiement.findFirst({
      where: { id: id.data, ownerId, statut: "RAPPROCHE" },
      select: {
        id: true,
        rembourseLe: true,
        don: { select: { id: true, montant: true } },
        mouvementCompte: { select: { id: true, montant: true } },
        allocations: { select: { echeanceId: true, montant: true, echeance: { select: { cycle: { select: { statut: true } } } } } },
      },
    });
    if (!paiement || paiement.allocations.some((a) => a.echeance.cycle.statut !== "OUVERT")) return null;
    // Excédent déjà rendu : annuler ferait réapparaître un « à rembourser » faux, ou le cacherait.
    if (paiement.rembourseLe) return "Excédent déjà marqué remboursé : ce rapprochement ne peut plus être annulé.";

    // Bonne volonté issue de ce paiement : elle repart avec lui (le paiement redevient entier, à rapprocher).
    if (paiement.don) {
      await tx.don.delete({ where: { id: paiement.don.id } });
      await journaliser(tx, { ownerId, entite: "Don", entiteId: paiement.don.id, action: "SUPPRESSION", details: { montant: paiement.don.montant, annulationRapprochement: true } });
    }

    // Versé sur un compte gardé : le versement disparaît du compte avec le rapprochement.
    if (paiement.mouvementCompte) {
      await tx.mouvementCompte.delete({ where: { id: paiement.mouvementCompte.id } });
      await journaliser(tx, {
        ownerId,
        entite: "MouvementCompte",
        entiteId: paiement.mouvementCompte.id,
        action: "SUPPRESSION",
        details: { montant: paiement.mouvementCompte.montant, annulationRapprochement: true },
      });
    }

    await tx.allocation.deleteMany({ where: { paiementId: paiement.id } });
    for (const a of paiement.allocations) {
      await journaliser(tx, { ownerId, entite: "Allocation", entiteId: `${paiement.id}:${a.echeanceId}`, action: "SUPPRESSION", details: { montant: a.montant, annulation: true } });
    }
    await tx.paiement.update({ where: { id: paiement.id }, data: { statut: "A_RAPPROCHER", rapprocheLe: null } });
    await journaliser(tx, { ownerId, entite: "Paiement", entiteId: paiement.id, action: "MODIFICATION", details: { annulationRapprochement: true } });
    return null;
  });
  if (refus) await annoncer(refus);
  refresh();
}
