"use server";

import { refresh } from "next/cache";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { ajouterJours, aujourdhui, prochaineEcheance } from "@/lib/cycles/dates";
import { creerEcheancesDuCycle } from "@/lib/cycles/echeances";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { schemaOuvertureCycle } from "@/lib/validation/cycle";

export type EtatOuvertureCycle = { erreur?: string; erreurs?: Record<string, string>; valeurs?: Record<string, string> } | undefined;

/**
 * Ouvre le PREMIER cycle d'une tontine. Numéro et date d'échéance sont choisis par la
 * trésorière (la tontine tourne peut-être déjà : 8e tour…). Crée en une transaction le
 * cycle et une échéance par membre actif. Les cycles suivants : phase 8 (clôture).
 */
export async function ouvrirPremierCycle(
  caisseId: string,
  _etat: EtatOuvertureCycle,
  formData: FormData,
): Promise<EtatOuvertureCycle> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs = { numero: String(formData.get("numero") ?? ""), dateEcheance: String(formData.get("dateEcheance") ?? "") };
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Caisse introuvable.", valeurs };

  const saisie = schemaOuvertureCycle.safeParse(valeurs);
  if (!saisie.success) {
    const erreurs: Record<string, string> = {};
    for (const issue of saisie.error.issues) erreurs[String(issue.path[0])] ??= issue.message;
    return { erreurs, valeurs };
  }

  const caisse = await prisma.caisse.findFirst({
    where: { id: idValide.data, ownerId, statut: "ACTIVE", type: "TONTINE" },
    select: { id: true, montantCotisation: true, _count: { select: { cycles: true } } },
  });
  if (!caisse) return { erreur: "Tontine introuvable ou archivée.", valeurs };
  if (caisse._count.cycles > 0) return { erreur: "Cette tontine a déjà un cycle.", valeurs };

  const { numero, dateEcheance } = saisie.data;
  // Début = aujourd'hui, sauf si l'échéance choisie est déjà passée (reprise d'une tontine en cours).
  const debut = aujourdhui();
  const dateDebut = dateEcheance < debut ? dateEcheance : debut;

  try {
    await prisma.$transaction(async (tx) => {
      const cycle = await tx.cycle.create({ data: { caisseId: caisse.id, numero, dateDebut, dateEcheance }, select: { id: true } });
      await creerEcheancesDuCycle(tx, cycle.id, caisse.id, caisse.montantCotisation);
    });
  } catch {
    // Index unique partiel « un seul cycle ouvert » ou numéro déjà pris : rien n'est écrit.
    return { erreur: "Le cycle n'a pas pu être ouvert (un cycle est peut-être déjà ouvert). Recharge la page.", valeurs };
  }
  refresh();
}

/** Rattrapage : crée le cycle unique d'une collecte qui n'en a pas (collectes créées avant la phase 5). */
export async function creerCycleCollecte(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(formData.get("caisseId"));
  if (!idValide.success) return;

  const caisse = await prisma.caisse.findFirst({
    where: { id: idValide.data, ownerId, statut: "ACTIVE", type: "COLLECTE", cycles: { none: {} } },
    select: { id: true, montantCotisation: true, dateLimite: true },
  });
  if (!caisse?.dateLimite) return;
  const dateLimite = caisse.dateLimite;

  await prisma.$transaction(async (tx) => {
    const debut = aujourdhui();
    const cycle = await tx.cycle.create({
      data: { caisseId: caisse.id, numero: 1, dateDebut: dateLimite < debut ? dateLimite : debut, dateEcheance: dateLimite },
      select: { id: true },
    });
    await creerEcheancesDuCycle(tx, cycle.id, caisse.id, caisse.montantCotisation);
  });
  refresh();
}

export type EtatCloture = { erreur?: string } | undefined;

/**
 * Clôture le cycle ouvert d'une caisse (irréversible). Tontine : ouvre le cycle suivant
 * (n° + 1, début = lendemain de l'échéance, échéance calculée), avec une échéance par membre
 * actif ; les impayés restent dus et deviennent des arriérés. Collecte : elle se termine.
 * Tout dans une transaction : jamais un cycle clos sans son suivant, ni l'inverse.
 */
export async function cloturerCycle(caisseId: string): Promise<EtatCloture> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Caisse introuvable." };

  const caisse = await prisma.caisse.findFirst({
    where: { id: idValide.data, ownerId, statut: "ACTIVE" },
    select: { id: true, type: true, frequence: true, jourEcheance: true, montantCotisation: true, cycles: { where: { statut: "OUVERT" }, select: { id: true, numero: true, dateEcheance: true } } },
  });
  const cycle = caisse?.cycles[0];
  if (!caisse || !cycle) return { erreur: "Aucun cycle ouvert à clôturer." };

  let suivant: { debut: Date; echeance: Date } | null = null;
  if (caisse.type === "TONTINE") {
    const debut = ajouterJours(cycle.dateEcheance, 1);
    const echeance = prochaineEcheance(caisse.frequence, caisse.jourEcheance, debut);
    if (!echeance) return { erreur: "Impossible de calculer l'échéance du cycle suivant (fréquence ou jour manquant)." };
    suivant = { debut, echeance };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // updateMany + statut OUVERT : si deux clôtures partent en même temps, la seconde ne trouve plus rien.
      const { count } = await tx.cycle.updateMany({ where: { id: cycle.id, statut: "OUVERT" }, data: { statut: "CLOTURE", dateCloture: new Date() } });
      if (count === 0) throw new Error("Cycle déjà clôturé");
      let cycleSuivant: string | null = null;
      if (suivant) {
        const nouveau = await tx.cycle.create({
          data: { caisseId: caisse.id, numero: cycle.numero + 1, dateDebut: suivant.debut, dateEcheance: suivant.echeance },
          select: { id: true },
        });
        await creerEcheancesDuCycle(tx, nouveau.id, caisse.id, caisse.montantCotisation);
        cycleSuivant = nouveau.id;
      }
      await journaliser(tx, { ownerId, entite: "Cycle", entiteId: cycle.id, action: "MODIFICATION", details: { statut: "CLOTURE", numero: cycle.numero, cycleSuivant } });
    });
  } catch {
    return { erreur: "La clôture a échoué et rien n'a été modifié. Recharge la page." };
  }
  await annoncer(caisse.type === "COLLECTE" ? "Collecte clôturée" : "Cycle clôturé, le suivant est ouvert ✓");
  refresh();
}
