"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { assurerEcheanceMembre, retirerEcheanceMembre } from "@/lib/cycles/echeances";
import { ordreSuivant } from "@/lib/donnees/membres";
import { signalerErreur } from "@/lib/erreurs";
import { StatutMembre } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";

const schemaAjout = z.object({ caisseId: schemaIdentifiant, personneId: schemaIdentifiant });

/**
 * Inscrit une personne existante dans une caisse. Une personne n'est jamais dupliquée :
 * c'est la même ligne Personne qui devient membre de plusieurs caisses.
 * Déjà membre inactif → réactivée ; déjà membre actif → rien à faire.
 */
export async function ajouterMembre(formData: FormData) {
  await inscrire(formData.get("caisseId"), formData.get("personneId"));
}

/**
 * Même chose, avec les identifiants liés d'avance (bind). Sert aux boutons à formAction,
 * qui ne peuvent pas porter name/value : React les utilise pour encoder l'action.
 */
export async function inscrirePersonneExistante(caisseId: string, personneId: string) {
  await inscrire(caisseId, personneId);
}

async function inscrire(idCaisse: unknown, idPersonne: unknown) {
  const { id: ownerId } = await exigerUtilisatrice();
  const saisie = schemaAjout.safeParse({ caisseId: idCaisse, personneId: idPersonne });
  if (!saisie.success) return;
  const { caisseId, personneId } = saisie.data;

  // Les deux doivent appartenir à l'utilisatrice connectée.
  const [caisse, personne] = await Promise.all([
    // Un compte gardé n'a qu'un membre, son titulaire, fixé à la création.
    prisma.caisse.findFirst({ where: { id: caisseId, ownerId, statut: "ACTIVE", type: { not: "COMPTE_GARDE" } }, select: { type: true } }),
    prisma.personne.count({ where: { id: personneId, ownerId } }),
  ]);
  if (!caisse || !personne) return;

  await prisma.$transaction(async (tx) => {
    const existant = await tx.membreCaisse.findUnique({ where: { caisseId_personneId: { caisseId, personneId } } });
    if (existant) {
      // Réactivé sans ordre : la trésorière lui en attribue un à la main.
      if (existant.statut === StatutMembre.INACTIF) {
        await tx.membreCaisse.update({ where: { id: existant.id }, data: { statut: StatutMembre.ACTIF, ordrePassage: null } });
        await assurerEcheanceMembre(tx, existant.id, caisseId);
      }
      return;
    }
    const ordrePassage = caisse.type === "TONTINE" ? await ordreSuivant(tx, caisseId) : null;
    const membre = await tx.membreCaisse.create({ data: { caisseId, personneId, ordrePassage }, select: { id: true } });
    // Cycle ouvert : le nouveau membre doit cotiser tout de suite (cahier, phase 5).
    await assurerEcheanceMembre(tx, membre.id, caisseId);
  });
  await annoncer("Membre ajouté ✓");
  redirect(`/caisses/${caisseId}`);
}

const schemaStatut = z.object({
  membreId: schemaIdentifiant,
  statut: z.enum([StatutMembre.ACTIF, StatutMembre.INACTIF]),
});

/**
 * Retirer un membre = le passer INACTIF (jamais de suppression). Son ordre de passage est
 * libéré (null) pour pouvoir être réattribué ; réactivé, il revient sans ordre.
 * L'historique des passages sera porté par le bénéficiaire de chaque cycle (v1).
 */
export async function changerStatutMembre(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const saisie = schemaStatut.safeParse({ membreId: formData.get("membreId"), statut: formData.get("statut") });
  if (!saisie.success) return;

  const { membreId, statut } = saisie.data;
  // Le titulaire d'un compte gardé ne se retire pas : le compte resterait sans personne.
  const membre = await prisma.membreCaisse.findFirst({ where: { id: membreId, caisse: { ownerId, type: { not: "COMPTE_GARDE" } } }, select: { caisseId: true } });
  if (!membre) return;

  await prisma.$transaction(async (tx) => {
    // Écriture refiltrée par ownerId (via la caisse), en plus de la lecture ci-dessus (audit).
    await tx.membreCaisse.updateMany({ where: { id: membreId, caisse: { ownerId } }, data: { statut, ordrePassage: null } });
    // Échéance du cycle ouvert : retirée si rien n'y est payé ; recréée à la réactivation.
    if (statut === StatutMembre.INACTIF) await retirerEcheanceMembre(tx, membreId);
    else await assurerEcheanceMembre(tx, membreId, membre.caisseId);
    await journaliser(tx, { ownerId, entite: "MembreCaisse", entiteId: membreId, action: "MODIFICATION", details: { statut } });
  });
  await annoncer(statut === StatutMembre.INACTIF ? "Membre retiré" : "Membre réactivé ✓");
  refresh();
}

export type EtatOrdre = { erreur?: string } | undefined;

const schemaOrdre = z.object({
  membreId: schemaIdentifiant,
  ordre: z
    .string()
    .regex(/^\d+$/, { error: "Indique un nombre." })
    .transform(Number)
    .pipe(z.number().int().min(1, { error: "L'ordre commence à 1." }).max(999, { error: "Ordre trop grand." })),
});

/** Attribue un ordre de passage à un membre actif d'une tontine qui n'en a pas. */
export async function attribuerOrdre(_etat: EtatOrdre, formData: FormData): Promise<EtatOrdre> {
  const { id: ownerId } = await exigerUtilisatrice();
  const saisie = schemaOrdre.safeParse({ membreId: formData.get("membreId"), ordre: formData.get("ordre") });
  if (!saisie.success) return { erreur: saisie.error.issues[0].message };
  const { membreId, ordre } = saisie.data;

  const membre = await prisma.membreCaisse.findFirst({
    where: { id: membreId, statut: StatutMembre.ACTIF, caisse: { ownerId, type: "TONTINE" } },
    select: { caisseId: true },
  });
  if (!membre) return { erreur: "Membre introuvable." };

  const occupe = await prisma.membreCaisse.findFirst({
    where: { caisseId: membre.caisseId, ordrePassage: ordre },
    select: { personne: { select: { nomComplet: true } } },
  });
  if (occupe) return { erreur: `L'ordre ${ordre} est déjà pris par ${occupe.personne.nomComplet}. Utilise l'échange.` };

  try {
    await prisma.membreCaisse.update({ where: { id: membreId }, data: { ordrePassage: ordre } });
  } catch (e) {
    signalerErreur("membres.ordre", e);
    // Pris entre la vérification et l'écriture : la contrainte unique a refusé.
    return { erreur: `L'ordre ${ordre} vient d'être pris. Réessaie.` };
  }
  refresh();
}

export type EtatEchange = { erreur?: string; succes?: string } | undefined;

const schemaEchange = z
  .object({ caisseId: schemaIdentifiant, membreA: schemaIdentifiant, membreB: schemaIdentifiant })
  .refine((e) => e.membreA !== e.membreB, { error: "Choisis deux membres différents." });

/**
 * Échange les ordres de passage de deux membres d'une tontine.
 * La contrainte unique (caisse, ordre) est vérifiée à chaque instruction : on passe
 * donc par une valeur temporaire NULL, le tout dans une seule transaction.
 *   A → NULL, B → ordre de A, A → ancien ordre de B
 */
export async function echangerOrdres(_etat: EtatEchange, formData: FormData): Promise<EtatEchange> {
  const { id: ownerId } = await exigerUtilisatrice();
  const saisie = schemaEchange.safeParse({
    caisseId: formData.get("caisseId"),
    membreA: formData.get("membreA"),
    membreB: formData.get("membreB"),
  });
  if (!saisie.success) return { erreur: saisie.error.issues[0].message };
  const { caisseId, membreA, membreB } = saisie.data;

  const membres = await prisma.membreCaisse.findMany({
    where: { id: { in: [membreA, membreB] }, caisseId, caisse: { ownerId, type: "TONTINE" } },
    select: { id: true, ordrePassage: true, personne: { select: { nomComplet: true } } },
  });
  const a = membres.find((m) => m.id === membreA);
  const b = membres.find((m) => m.id === membreB);
  if (!a || !b) return { erreur: "Membres introuvables dans cette tontine." };

  await prisma.$transaction([
    prisma.membreCaisse.update({ where: { id: a.id }, data: { ordrePassage: null } }),
    prisma.membreCaisse.update({ where: { id: b.id }, data: { ordrePassage: a.ordrePassage } }),
    prisma.membreCaisse.update({ where: { id: a.id }, data: { ordrePassage: b.ordrePassage } }),
  ]);
  refresh();
  return { succes: `${a.personne.nomComplet} et ${b.personne.nomComplet} ont échangé leur ordre de passage.` };
}
