"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { lireFormulaireDepense, schemaDepense, type DonneesDepense } from "@/lib/validation/depense";

// Sorties de caisse d'une collecte (phase 11). Création, modification et suppression sont
// libres (choix de la trésorière) mais toujours écrites dans le journal d'audit, dans la
// même transaction.

export type EtatFormulaireDepense =
  | { erreur?: string; erreurs?: Record<string, string>; valeurs?: ReturnType<typeof lireFormulaireDepense> }
  | undefined;

function erreursParChamp(erreur: z.ZodError) {
  const erreurs: Record<string, string> = {};
  for (const issue of erreur.issues) erreurs[issue.path.join(".") || "formulaire"] ??= issue.message;
  return erreurs;
}

/** Valide la saisie ; une date dans le futur est une erreur de frappe. */
function lireSaisie(formData: FormData): { donnees: DonneesDepense } | { etat: EtatFormulaireDepense } {
  const valeurs = lireFormulaireDepense(formData);
  const saisie = schemaDepense.safeParse(valeurs);
  if (!saisie.success) return { etat: { erreurs: erreursParChamp(saisie.error), valeurs } };
  if (saisie.data.date > aujourdhui()) return { etat: { erreurs: { date: "La date ne peut pas être dans le futur." }, valeurs } };
  return { donnees: saisie.data };
}

/** Pour le journal : la dépense en clair (date au format AAAA-MM-JJ). */
const resumer = (d: DonneesDepense) => ({ ...d, date: d.date.toISOString().slice(0, 10) });

export async function creerDepense(caisseId: string, _etat: EtatFormulaireDepense, formData: FormData): Promise<EtatFormulaireDepense> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Caisse introuvable." };
  const caisse = await prisma.caisse.findFirst({ where: { id: idValide.data, ownerId, type: "COLLECTE", statut: "ACTIVE" }, select: { id: true } });
  if (!caisse) return { erreur: "Collecte introuvable ou archivée." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  await prisma.$transaction(async (tx) => {
    const depense = await tx.depense.create({ data: { ownerId, caisseId: caisse.id, ...lu.donnees }, select: { id: true } });
    await journaliser(tx, { ownerId, entite: "Depense", entiteId: depense.id, action: "CREATION", details: resumer(lu.donnees) });
  });
  await annoncer("Dépense enregistrée ✓");
  refresh();
  redirect(`/caisses/${caisse.id}?vue=depenses`);
}

export async function modifierDepense(id: string, _etat: EtatFormulaireDepense, formData: FormData): Promise<EtatFormulaireDepense> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) return { erreur: "Dépense introuvable." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  const caisseId = await prisma.$transaction(async (tx) => {
    const avant = await tx.depense.findFirst({
      where: { id: idValide.data, ownerId },
      select: { caisseId: true, date: true, montant: true, motif: true, beneficiaire: true, canal: true, categorie: true },
    });
    if (!avant) return null;
    // updateMany + ownerId : 0 ligne si la dépense n'est pas à elle.
    await tx.depense.updateMany({ where: { id: idValide.data, ownerId }, data: lu.donnees });
    const anciennes = { date: avant.date, montant: avant.montant, motif: avant.motif, beneficiaire: avant.beneficiaire, canal: avant.canal, categorie: avant.categorie };
    await journaliser(tx, {
      ownerId,
      entite: "Depense",
      entiteId: idValide.data,
      action: "MODIFICATION",
      details: { avant: resumer(anciennes), apres: resumer(lu.donnees) },
    });
    return avant.caisseId;
  });
  if (!caisseId) return { erreur: "Dépense introuvable." };
  await annoncer("Dépense modifiée ✓");
  refresh();
  redirect(`/caisses/${caisseId}?vue=depenses`);
}

export async function supprimerDepense(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("depenseId"));
  if (!id.success) return;

  const caisseId = await prisma.$transaction(async (tx) => {
    const depense = await tx.depense.findFirst({ where: { id: id.data, ownerId }, select: { caisseId: true, date: true, montant: true, motif: true, beneficiaire: true, canal: true, categorie: true } });
    if (!depense) return null;
    await tx.depense.deleteMany({ where: { id: id.data, ownerId } });
    const supprimee = { date: depense.date, montant: depense.montant, motif: depense.motif, beneficiaire: depense.beneficiaire, canal: depense.canal, categorie: depense.categorie };
    await journaliser(tx, { ownerId, entite: "Depense", entiteId: id.data, action: "SUPPRESSION", details: resumer(supprimee) });
    return depense.caisseId;
  });
  if (!caisseId) return;
  await annoncer("Dépense supprimée");
  refresh();
  redirect(`/caisses/${caisseId}?vue=depenses`);
}
