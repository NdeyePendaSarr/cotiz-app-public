"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { collecteDuDon, excedentPaiement } from "@/lib/dons";
import { formaterFCFA } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { verrouillerPaiement, verrouillerPaiementDuDon } from "@/lib/verrous";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { lireFormulaireDon, schemaDon, type DonneesDon } from "@/lib/validation/don";

// Bonnes volontés d'une collecte : dons en plus des cotisations, saisis à part ou issus de
// l'excédent d'un paiement. Création, modification et suppression libres, toujours écrites
// dans le journal d'audit, dans la même transaction. Une fois l'excédent du paiement remboursé,
// le montant de sa bonne volonté est figé : l'encaissé resterait faux.

const REFUS_REMBOURSE = "L'excédent de ce paiement est déjà remboursé : le montant de cette bonne volonté ne peut plus changer.";

export type EtatFormulaireDon = { erreur?: string; erreurs?: Record<string, string>; valeurs?: ReturnType<typeof lireFormulaireDon> } | undefined;

function erreursParChamp(erreur: z.ZodError) {
  const erreurs: Record<string, string> = {};
  for (const issue of erreur.issues) erreurs[issue.path.join(".") || "formulaire"] ??= issue.message;
  return erreurs;
}

/** Valide la saisie ; une date dans le futur est une erreur de frappe. */
function lireSaisie(formData: FormData): { donnees: DonneesDon } | { etat: EtatFormulaireDon } {
  const valeurs = lireFormulaireDon(formData);
  const saisie = schemaDon.safeParse(valeurs);
  if (!saisie.success) return { etat: { erreurs: erreursParChamp(saisie.error), valeurs } };
  if (saisie.data.date > aujourdhui()) return { etat: { erreurs: { date: "La date ne peut pas être dans le futur." }, valeurs } };
  return { donnees: saisie.data };
}

/** Pour le journal : le don en clair (date au format AAAA-MM-JJ). */
const resumer = (d: DonneesDon) => ({ ...d, date: d.date.toISOString().slice(0, 10) });

const vueDons = (caisseId: string) => `/caisses/${caisseId}?vue=dons`;

export async function creerDon(caisseId: string, _etat: EtatFormulaireDon, formData: FormData): Promise<EtatFormulaireDon> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Caisse introuvable." };
  const caisse = await prisma.caisse.findFirst({ where: { id: idValide.data, ownerId, type: { in: ["COLLECTE", "MENSUALITE"] }, statut: "ACTIVE" }, select: { id: true } });
  if (!caisse) return { erreur: "Collecte introuvable ou archivée." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  await prisma.$transaction(async (tx) => {
    const don = await tx.don.create({ data: { ownerId, caisseId: caisse.id, ...lu.donnees }, select: { id: true } });
    await journaliser(tx, { ownerId, entite: "Don", entiteId: don.id, action: "CREATION", details: resumer(lu.donnees) });
  });
  await annoncer("Bonne volonté enregistrée ✓");
  refresh();
  redirect(vueDons(caisse.id));
}

export async function modifierDon(id: string, _etat: EtatFormulaireDon, formData: FormData): Promise<EtatFormulaireDon> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) return { erreur: "Bonne volonté introuvable." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  const resultat = await prisma.$transaction(async (tx) => {
    await verrouillerPaiementDuDon(tx, ownerId, idValide.data);
    const avant = await tx.don.findFirst({
      where: { id: idValide.data, ownerId },
      select: {
        caisseId: true,
        date: true,
        montant: true,
        donateur: true,
        remisPar: true,
        canal: true,
        note: true,
        paiement: { select: { montant: true, rembourseLe: true, allocations: { select: { montant: true } }, mouvementCompte: { select: { montant: true } } } },
      },
    });
    if (!avant) return { erreur: "Bonne volonté introuvable." };
    // Issue d'un paiement : jamais plus que ce que le paiement n'a pas déjà donné aux cotisations.
    if (avant.paiement) {
      // Excédent remboursé : le reste a quitté la caisse, le montant de la bonne volonté ne bouge plus.
      if (avant.paiement.rembourseLe && lu.donnees.montant !== avant.montant) return { erreur: REFUS_REMBOURSE };
      const disponible = excedentPaiement(avant.paiement.montant, avant.paiement.allocations, null, avant.paiement.mouvementCompte);
      if (lu.donnees.montant > disponible) return { erreurMontant: disponible };
    }
    await tx.don.updateMany({ where: { id: idValide.data, ownerId }, data: lu.donnees });
    const anciennes = { date: avant.date, montant: avant.montant, donateur: avant.donateur, remisPar: avant.remisPar, canal: avant.canal, note: avant.note };
    await journaliser(tx, { ownerId, entite: "Don", entiteId: idValide.data, action: "MODIFICATION", details: { avant: resumer(anciennes), apres: resumer(lu.donnees) } });
    return { caisseId: avant.caisseId };
  });
  if (resultat.erreurMontant !== undefined) {
    return { erreurs: { montant: `Au plus ${formaterFCFA(resultat.erreurMontant)} : le reste de ce paiement va aux cotisations.` }, valeurs: lireFormulaireDon(formData) };
  }
  if (resultat.erreur !== undefined || !resultat.caisseId) return { erreur: resultat.erreur ?? "Bonne volonté introuvable." };
  await annoncer("Bonne volonté modifiée ✓");
  refresh();
  redirect(vueDons(resultat.caisseId));
}

export async function supprimerDon(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("donId"));
  if (!id.success) return;

  const caisseId = await prisma.$transaction(async (tx) => {
    await verrouillerPaiementDuDon(tx, ownerId, id.data);
    const don = await tx.don.findFirst({ where: { id: id.data, ownerId }, select: { caisseId: true, date: true, montant: true, donateur: true, remisPar: true, canal: true, note: true, paiementId: true, paiement: { select: { rembourseLe: true } } } });
    if (!don) return null;
    if (don.paiement?.rembourseLe) return { refus: true as const };
    await tx.don.deleteMany({ where: { id: id.data, ownerId } });
    const supprime = { date: don.date, montant: don.montant, donateur: don.donateur, remisPar: don.remisPar, canal: don.canal, note: don.note };
    // Issu d'un paiement : l'excédent redevient « à rembourser ».
    await journaliser(tx, { ownerId, entite: "Don", entiteId: id.data, action: "SUPPRESSION", details: { ...resumer(supprime), paiementId: don.paiementId } });
    return don.caisseId;
  });
  if (!caisseId) return;
  if (typeof caisseId !== "string") {
    await annoncer(REFUS_REMBOURSE);
    refresh();
    return;
  }
  await annoncer("Bonne volonté supprimée");
  refresh();
  redirect(vueDons(caisseId));
}

/**
 * « Garder comme bonne volonté » (page À rembourser) : l'excédent d'un paiement rapproché devient
 * un don à la collecte de ses cotisations, au nom de la personne, à la date et sur le canal du paiement.
 */
export async function garderCommeDon(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("paiementId"));
  if (!id.success) return;

  const fait = await prisma.$transaction(async (tx) => {
    // Verrou : « Garder comme bonne volonté » et « Marquer remboursé » ne peuvent pas passer tous les deux.
    if (!(await verrouillerPaiement(tx, ownerId, id.data, ["RAPPROCHE"]))) return false;
    const paiement = await tx.paiement.findFirst({
      where: { id: id.data, ownerId, statut: "RAPPROCHE", rembourseLe: null, don: null },
      select: {
        id: true,
        montant: true,
        canal: true,
        dateReception: true,
        nomExpediteur: true,
        personne: { select: { nomComplet: true } },
        allocations: { select: { montant: true, echeance: { select: { cycle: { select: { caisse: { select: { id: true, nom: true, type: true, statut: true } } } } } } } },
      },
    });
    if (!paiement) return false;
    const collecte = collecteDuDon(paiement.allocations);
    const excedent = excedentPaiement(paiement.montant, paiement.allocations);
    if (!collecte || excedent <= 0) return false;

    const donnees = {
      date: new Date(`${paiement.dateReception.toISOString().slice(0, 10)}T00:00:00.000Z`),
      montant: excedent,
      donateur: (paiement.personne?.nomComplet ?? paiement.nomExpediteur ?? "Anonyme").slice(0, 150),
      remisPar: null,
      canal: paiement.canal,
      note: "Surplus du paiement, gardé comme bonne volonté",
    };
    const don = await tx.don.create({ data: { ownerId, caisseId: collecte.id, paiementId: paiement.id, ...donnees }, select: { id: true } });
    await journaliser(tx, { ownerId, entite: "Don", entiteId: don.id, action: "CREATION", details: { ...resumer(donnees), paiementId: paiement.id } });
    return true;
  });
  if (!fait) return;
  await annoncer("Gardé comme bonne volonté ✓");
  refresh();
}
