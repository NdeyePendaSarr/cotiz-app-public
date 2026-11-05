"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { datationsPossibles } from "@/lib/donnees/rapprochement";
import { aujourdhui, ajouterJours } from "@/lib/cycles/dates";
import { CAPTURE_IGNOREE_LIBRE, REPRISE_NON_DATEE } from "@/lib/paiements/origine";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { lireModeleOrangeMoney } from "@/lib/capture/modele-orange-money";
import { lireModeleWave, normaliserReferenceWave } from "@/lib/capture/modele-wave";
import { preparerCaptureSms } from "@/lib/capture/sms";
import { formaterDate, formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { verrouillerPaiement, verrouillerPaiementParReference, verrouillerPaiements } from "@/lib/verrous";

/**
 * Rattrapage après un import : chaque versé repris de la liste reçoit la date du SMS ignoré qui
 * était le même argent (lib/import/datation.ts). Rien ne vient du navigateur : l'appariement est
 * calculé ici, puis revérifié pour chacun dans sa transaction (versé encore non daté et rapproché,
 * SMS encore ignorés et jamais utilisés, montants qui collent). Seule la date change ; le SMS reste
 * ignoré et relié au versé (dateRepriseId) pour ne jamais revenir dans les comptes. Journal d'audit des deux côtés.
 */
export async function daterRepriseParSms() {
  const { id: ownerId } = await exigerUtilisatrice();
  const datations = await datationsPossibles(ownerId);

  let dates = 0;
  for (const d of datations) {
    const fait = await prisma.$transaction(async (tx) => {
      // Verrous : le versé, puis ses SMS (une datation simultanée attend, puis les voit déjà pris).
      if (!(await verrouillerPaiement(tx, ownerId, d.repriseId, ["RAPPROCHE"]))) return false;
      await verrouillerPaiements(tx, ownerId, d.smsIds);
      const reprise = await tx.paiement.findFirst({ where: { id: d.repriseId, ownerId, ...REPRISE_NON_DATEE, statut: "RAPPROCHE" }, select: { id: true, montant: true } });
      if (!reprise) return false;
      const sms = await tx.paiement.findMany({
        where: { id: { in: d.smsIds }, ownerId, ...CAPTURE_IGNOREE_LIBRE },
        select: { id: true, montant: true },
      });
      if (sms.length !== d.smsIds.length || sms.reduce((t, s) => t + s.montant, 0) !== reprise.montant) return false;

      await tx.paiement.update({ where: { id: reprise.id }, data: { dateReception: d.date, datation: "PAR_SMS" } });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: reprise.id, action: "MODIFICATION", details: { dateReception: d.date.toISOString(), dateeParSms: d.smsIds } });
      for (const s of sms) {
        await tx.paiement.update({ where: { id: s.id }, data: { dateRepriseId: reprise.id } });
        await journaliser(tx, { ownerId, entite: "Paiement", entiteId: s.id, action: "MODIFICATION", details: { dateReporteeSur: reprise.id } });
      }
      return true;
    });
    if (fait) dates++;
  }

  await annoncer(`${dates} versé${dates > 1 ? "s" : ""} de la liste daté${dates > 1 ? "s" : ""} par leur SMS ✓`);
  refresh();
}

/** Retour des formulaires Wave et Orange Money de la page « Dater les versés » (useActionState). */
export type EtatDatationWave = { erreur?: string; conflit?: { message: string; rattachable: boolean } } | undefined;

const LIBELLES_STATUT_PAIEMENT = { A_RAPPROCHER: "à rapprocher", RAPPROCHE: "rapproché", IGNORE: "ignoré" } as const;

/**
 * Cœur commun (SMS Wave collé, modèle Wave ou modèle Orange Money) : date un versé du canal donné
 * avec la date et la référence d'un paiement de ce canal, sans créer de paiement (c'est le même
 * argent). Si la référence est
 * déjà dans Cotiz :
 * - SMS ignoré libre → il sert, et il est marqué (comme en le choisissant) ;
 * - SMS ou référence qui a déjà daté un AUTRE versé → message précis ; avec `rattacher`, la datation
 *   passe sur ce versé et l'autre redevient « sans date » (choix de la trésorière) ;
 * - paiement compté (à rapprocher, rapproché) → refus, avec la personne et l'état de ce paiement.
 * Tout est revérifié dans la transaction ; journal d'audit de chaque paiement touché.
 */
async function daterParReference(
  ownerId: string,
  repriseId: string,
  d: { canal: "WAVE" | "ORANGE_MONEY"; montant?: number; dateReception: Date; reference: string | null; source: "SMS" | "APPLICATION" },
  rattacher: boolean,
): Promise<EtatDatationWave> {
  const nomCanal = LIBELLES_CANAL[d.canal];
  const resultat = await prisma.$transaction(async (tx): Promise<EtatDatationWave | null> => {
    // Verrous : le versé, puis le paiement qui porte déjà cette référence (lu ensuite, à jour).
    if (!(await verrouillerPaiement(tx, ownerId, repriseId, ["RAPPROCHE"]))) return { erreur: "Ce versé a déjà été daté." };
    if (d.reference) await verrouillerPaiementParReference(tx, ownerId, d.canal, d.reference);
    const reprise = await tx.paiement.findFirst({ where: { id: repriseId, ownerId, ...REPRISE_NON_DATEE, statut: "RAPPROCHE" }, select: { id: true, montant: true, canal: true } });
    if (!reprise) return { erreur: "Ce versé a déjà été daté." };
    if (reprise.canal !== d.canal) return { erreur: `Ce versé n'est pas un paiement ${nomCanal} : saisis plutôt la date.` };
    if (d.montant !== undefined && d.montant !== reprise.montant) {
      return { erreur: `Le SMS est de ${formaterFCFA(d.montant)}, le versé de ${formaterFCFA(reprise.montant)} : ce n'est pas le même argent.` };
    }

    const deja = d.reference
      ? await tx.paiement.findFirst({
          where: { ownerId, canal: d.canal, reference: d.reference },
          select: { id: true, statut: true, origine: true, dateRepriseId: true, montant: true, dateReception: true, personne: { select: { nomComplet: true } } },
        })
      : null;
    let garderReference = Boolean(d.reference) && !deja;

    if (deja) {
      const estReprise = deja.origine === "REPRISE_IMPORT";
      const libre = deja.statut === "IGNORE" && !estReprise && !deja.dateRepriseId;
      if (libre) {
        await tx.paiement.update({ where: { id: deja.id }, data: { dateRepriseId: reprise.id } });
        await journaliser(tx, { ownerId, entite: "Paiement", entiteId: deja.id, action: "MODIFICATION", details: { dateReporteeSur: reprise.id } });
      } else if (estReprise || deja.dateRepriseId) {
        // Versé qui porte déjà cette référence, ou versé daté par ce SMS (lien dateRepriseId).
        const autreId = estReprise ? deja.id : deja.dateRepriseId;
        if (autreId) await verrouillerPaiements(tx, ownerId, [autreId]);
        const autre = autreId
          ? await tx.paiement.findFirst({
              where: { id: autreId, ownerId, origine: "REPRISE_IMPORT" },
              select: { id: true, montant: true, rapprocheLe: true, personne: { select: { nomComplet: true } } },
            })
          : null;
        if (!autre) return { erreur: `Ce paiement ${nomCanal} est déjà utilisé dans Cotiz, mais on ne retrouve pas à quoi. Saisis la date à la main.` };
        if (!rattacher) {
          return {
            conflit: {
              message: `Ce paiement ${nomCanal} a déjà servi à dater le versé de ${autre.personne?.nomComplet ?? "quelqu'un d'autre"} (${formaterFCFA(autre.montant)}). Si c'est bien le paiement de cette ligne, rattache-le ici : l'autre versé redeviendra « sans date ».`,
              rattachable: true,
            },
          };
        }
        await tx.paiement.update({
          where: { id: autre.id },
          data: { datation: "NON_DATEE", dateReception: autre.rapprocheLe ?? new Date(), ...(estReprise && { reference: null }) },
        });
        await journaliser(tx, { ownerId, entite: "Paiement", entiteId: autre.id, action: "MODIFICATION", details: { dateRetiree: true, paiementRattacheA: reprise.id } });
        if (estReprise) garderReference = true;
        else {
          await tx.paiement.update({ where: { id: deja.id }, data: { dateRepriseId: reprise.id } });
          await journaliser(tx, { ownerId, entite: "Paiement", entiteId: deja.id, action: "MODIFICATION", details: { dateReporteeSur: reprise.id } });
        }
      } else {
        const qui = deja.personne ? `pour ${deja.personne.nomComplet}` : "sans personne";
        return {
          conflit: {
            message: `Ce paiement ${nomCanal} est déjà compté dans Cotiz : ${formaterFCFA(deja.montant)} ${qui}, ${LIBELLES_STATUT_PAIEMENT[deja.statut]}, reçu le ${formaterDate(deja.dateReception)}. Il ne peut pas dater ce versé : vérifie sur la fiche de la personne s'il ne s'agit pas du même argent.`,
            rattachable: false,
          },
        };
      }
    }

    await tx.paiement.update({
      where: { id: reprise.id },
      data: { dateReception: d.dateReception, datation: "PAR_SMS", ...(garderReference && d.reference && { reference: d.reference }) },
    });
    await journaliser(tx, {
      ownerId,
      entite: "Paiement",
      entiteId: reprise.id,
      action: "MODIFICATION",
      details: { dateReception: d.dateReception.toISOString(), reference: d.reference, source: d.source, ...(deja && { paiementDuCanal: deja.id }) },
    });
    return null;
  });

  if (resultat) return resultat;
  await annoncer("Versé daté ✓");
  refresh();
  return undefined;
}

/**
 * Datation d'un versé Wave en collant son SMS : lu comme à la capture (solde retiré avant tout et
 * jamais lu), aucun paiement créé, montant identique exigé. Le texte du SMS n'est pas conservé.
 */
export async function daterRepriseAvecSms(repriseId: string, _etat: EtatDatationWave, formData: FormData): Promise<EtatDatationWave> {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(repriseId);
  if (!id.success) return { erreur: "Versé introuvable." };
  const sms = preparerCaptureSms(formData.get("texte"));
  if (sms.type !== "paiement") return { erreur: sms.type === "refus" ? sms.raison : "SMS Wave illisible : vérifie qu'il est complet, ou utilise l'application Wave." };
  const { montant, dateReception, reference } = sms.donnees;
  return daterParReference(
    ownerId,
    id.data,
    { canal: "WAVE", montant, dateReception, reference: reference ? normaliserReferenceWave(reference) : null, source: "SMS" },
    formData.get("rattacher") === "1",
  );
}

/**
 * Datation d'un versé Wave sans SMS, avec le modèle rempli depuis l'application Wave (date, heure,
 * ID de transaction recopiés). Aucune capture d'écran n'est conservée : elle montre le solde.
 */
export async function daterRepriseDepuisModele(repriseId: string, _etat: EtatDatationWave, formData: FormData): Promise<EtatDatationWave> {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(repriseId);
  if (!id.success) return { erreur: "Versé introuvable." };
  const texte = formData.get("texte");
  if (typeof texte !== "string") return { erreur: "Complète d'abord le modèle." };
  const { texteSms, reference } = lireModeleWave(texte);
  if (!reference) return { erreur: "Recopie l'ID de transaction après « ID de transaction : » (il commence par T_)." };
  const lu = preparerCaptureSms(texteSms);
  if (lu.type !== "paiement") return { erreur: "Remplace « JJ » et « HHhMM » par la date et l'heure affichées dans l'application Wave (ex. 31/10/2026 à 10h14)." };
  const { montant, dateReception } = lu.donnees;
  if (dateReception > new Date() || dateReception < ajouterJours(aujourdhui(), -366)) return { erreur: "Date impossible : ni dans le futur, ni il y a plus d'un an." };
  return daterParReference(ownerId, id.data, { canal: "WAVE", montant, dateReception, reference, source: "APPLICATION" }, formData.get("rattacher") === "1");
}

/**
 * Datation d'un versé Orange Money avec le modèle rempli depuis l'application Orange Money (date,
 * heure, référence « PP… ») : son SMS ne porte pas la date, et le lire est prévu en v1 (cahier).
 */
export async function daterRepriseDepuisModeleOrangeMoney(repriseId: string, _etat: EtatDatationWave, formData: FormData): Promise<EtatDatationWave> {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(repriseId);
  if (!id.success) return { erreur: "Versé introuvable." };
  const texte = formData.get("texte");
  if (typeof texte !== "string") return { erreur: "Complète d'abord le modèle." };
  const { montant, dateReception, reference } = lireModeleOrangeMoney(texte);
  if (montant === null) return { erreur: "Garde la première ligne du modèle : elle porte le montant du versé." };
  if (!dateReception) return { erreur: "Remplace « JJ » et « HHhMM » par la date et l'heure affichées dans Orange Money (ex. 31/10/2026 à 01h38)." };
  if (!reference) return { erreur: "Recopie la référence après « Référence : » (elle commence par PP)." };
  if (dateReception > new Date() || dateReception < ajouterJours(aujourdhui(), -366)) return { erreur: "Date impossible : ni dans le futur, ni il y a plus d'un an." };
  return daterParReference(ownerId, id.data, { canal: "ORANGE_MONEY", montant, dateReception, reference, source: "APPLICATION" }, formData.get("rattacher") === "1");
}

// Une date saisie : AAAA-MM-JJ, pas dans le futur, pas plus d'un an en arrière.
const schemaDateSaisie = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => new Date(`${v}T12:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()) && d <= ajouterJours(aujourdhui(), 1) && d >= ajouterJours(aujourdhui(), -366));

/**
 * Datation à la main d'un versé repris (page « Dater les versés ») : avec le SMS ignoré choisi
 * par la trésorière (même règle que le rattrapage automatique : seule la date change, le SMS est
 * marqué pour ne jamais revenir, montant identique exigé), ou avec une date saisie quand il n'y a
 * pas de SMS (espèces, Orange Money). Tout est revérifié dans la transaction ; journal d'audit.
 */
export async function daterRepriseALaMain(repriseId: string, formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(repriseId);
  if (!id.success) return;
  const smsId = schemaIdentifiant.safeParse(formData.get("smsId"));
  const date = schemaDateSaisie.safeParse(formData.get("date"));
  if (!smsId.success && !date.success) {
    await annoncer("Choisis un SMS ou une date valide (pas dans le futur).");
    return;
  }

  const DEJA_TRAITE = "Ce versé ou ce SMS a déjà été traité.";
  const message = await prisma.$transaction(async (tx) => {
    // Verrous : le versé, puis le SMS choisi (deux datations simultanées avec le même SMS : une seule passe).
    if (!(await verrouillerPaiement(tx, ownerId, id.data, ["RAPPROCHE"]))) return DEJA_TRAITE;
    if (smsId.success) await verrouillerPaiements(tx, ownerId, [smsId.data]);
    const reprise = await tx.paiement.findFirst({ where: { id: id.data, ownerId, ...REPRISE_NON_DATEE, statut: "RAPPROCHE" }, select: { id: true, montant: true } });
    if (!reprise) return DEJA_TRAITE;
    if (smsId.success) {
      const sms = await tx.paiement.findFirst({
        where: { id: smsId.data, ownerId, ...CAPTURE_IGNOREE_LIBRE },
        select: { id: true, dateReception: true, montant: true },
      });
      if (!sms) return DEJA_TRAITE;
      // Un SMS d'un autre montant n'est pas le même argent : il sortirait des comptes pour rien.
      if (sms.montant !== reprise.montant) return `Le SMS est de ${formaterFCFA(sms.montant)}, le versé de ${formaterFCFA(reprise.montant)} : ce n'est pas le même argent.`;
      await tx.paiement.update({ where: { id: reprise.id }, data: { dateReception: sms.dateReception, datation: "PAR_SMS" } });
      await tx.paiement.update({ where: { id: sms.id }, data: { dateRepriseId: reprise.id } });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: reprise.id, action: "MODIFICATION", details: { dateReception: sms.dateReception.toISOString(), dateeParSms: [sms.id], aLaMain: true } });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: sms.id, action: "MODIFICATION", details: { dateReporteeSur: reprise.id } });
      return "Versé daté ✓";
    }
    if (!date.success) return DEJA_TRAITE;
    await tx.paiement.update({ where: { id: reprise.id }, data: { dateReception: date.data, datation: "A_LA_MAIN" } });
    await journaliser(tx, { ownerId, entite: "Paiement", entiteId: reprise.id, action: "MODIFICATION", details: { dateReception: date.data.toISOString(), aLaMain: true } });
    return "Versé daté ✓";
  });

  await annoncer(message);
  refresh();
}
