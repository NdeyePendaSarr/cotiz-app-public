"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { StatutCaisse } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { montantDuParMembre } from "@/lib/mensualite";
import { schemaCaisse, schemaIdentifiant, versChampsCaisse } from "@/lib/validation/caisse";

export type EtatFormulaireCaisse =
  | { erreur?: string; erreurs?: Record<string, string>; valeurs?: Record<string, string> }
  | undefined;

const CHAMPS = ["type", "nom", "montantCotisation", "frequence", "jourEcheance", "dateLimite", "modeleRelance", "titulaireId", "nombreMois", "moisDebut"] as const;

function lireFormulaire(formData: FormData) {
  const valeurs: Record<string, string> = {};
  for (const champ of CHAMPS) {
    const v = formData.get(champ);
    if (typeof v === "string") valeurs[champ] = v;
  }
  return valeurs;
}

// Première erreur de chaque champ, pour l'afficher sous le champ concerné.
function erreursParChamp(erreur: z.ZodError) {
  const erreurs: Record<string, string> = {};
  for (const issue of erreur.issues) {
    const champ = String(issue.path[0] ?? "formulaire");
    erreurs[champ] ??= issue.message;
  }
  return erreurs;
}

export async function creerCaisse(_etat: EtatFormulaireCaisse, formData: FormData): Promise<EtatFormulaireCaisse> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs = lireFormulaire(formData);
  const saisie = schemaCaisse.safeParse(valeurs);
  if (!saisie.success) return { erreurs: erreursParChamp(saisie.error), valeurs };

  const donnees = saisie.data;
  // Compte gardé : son titulaire, une personne de l'utilisatrice (revérifiée ici).
  let titulaireId: string | null = null;
  if (donnees.type === "COMPTE_GARDE") {
    const titulaire = donnees.titulaireId ? await prisma.personne.findFirst({ where: { id: donnees.titulaireId, ownerId }, select: { id: true } }) : null;
    if (!titulaire) return { erreurs: { titulaireId: "Choisis la personne pour qui tu gardes l'argent." }, valeurs };
    titulaireId = titulaire.id;
  }
  const caisse = await prisma.$transaction(async (tx) => {
    const creee = await tx.caisse.create({ data: { ownerId, ...versChampsCaisse(donnees) }, select: { id: true } });
    // Le titulaire est le seul membre d'un compte gardé (sans cycle ni échéance).
    if (titulaireId) await tx.membreCaisse.create({ data: { caisseId: creee.id, personneId: titulaireId } });
    // Une collecte a un seul cycle, créé avec elle (début = aujourd'hui, échéance = date limite).
    // Aucun membre encore : les échéances arrivent avec chaque membre ajouté ou importé.
    // Mensualité : un seul cycle pour toute la durée, du 1er du premier mois au dernier jour du dernier.
    if (donnees.type === "MENSUALITE") {
      const champs = versChampsCaisse(donnees);
      await tx.cycle.create({ data: { caisseId: creee.id, numero: 1, dateDebut: donnees.moisDebut, dateEcheance: champs.dateLimite! } });
    }
    if (donnees.type === "COLLECTE") {
      const debut = aujourdhui();
      await tx.cycle.create({
        data: { caisseId: creee.id, numero: 1, dateDebut: donnees.dateLimite < debut ? donnees.dateLimite : debut, dateEcheance: donnees.dateLimite },
      });
    }
    return creee;
  });
  await annoncer("Caisse créée ✓");
  redirect(`/caisses/${caisse.id}`);
}

export async function modifierCaisse(
  id: string,
  _etat: EtatFormulaireCaisse,
  formData: FormData,
): Promise<EtatFormulaireCaisse> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs = lireFormulaire(formData);
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) return { erreur: "Caisse introuvable.", valeurs };

  const saisie = schemaCaisse.safeParse(valeurs);
  if (!saisie.success) return { erreurs: erreursParChamp(saisie.error), valeurs };

  // Lecture filtrée par ownerId : une caisse d'une autre utilisatrice est « introuvable ».
  const existante = await prisma.caisse.findFirst({ where: { id: idValide.data, ownerId }, select: { type: true } });
  if (!existante) return { erreur: "Caisse introuvable.", valeurs };
  if (existante.type !== saisie.data.type) {
    return { erreur: "Le type d'une caisse ne peut pas être changé après sa création.", valeurs };
  }

  // Le nouveau montant ne vaut que pour les cycles futurs : les échéances existantes
  // gardent leur montantDu (décision du cahier, phase 4).
  const donnees = saisie.data;
  await prisma.$transaction(async (tx) => {
    await tx.caisse.updateMany({ where: { id: idValide.data, ownerId }, data: versChampsCaisse(donnees) });
    await journaliser(tx, {
      ownerId,
      entite: "Caisse",
      entiteId: idValide.data,
      action: "MODIFICATION",
      details: { nom: donnees.nom, montantCotisation: versChampsCaisse(donnees).montantCotisation },
    });
    // Collecte : la date limite est l'échéance de son cycle ouvert.
    if (donnees.type === "COLLECTE") {
      await tx.cycle.updateMany({ where: { caisseId: idValide.data, statut: "OUVERT" }, data: { dateEcheance: donnees.dateLimite } });
    }
    // Mensualité : premier mois, durée ou montant corrigés → dates du cycle et dû de chaque membre
    // recalculés (une seule échéance par membre pour toute la durée ; ce qui est versé reste versé).
    if (donnees.type === "MENSUALITE") {
      const champs = versChampsCaisse(donnees);
      const cycles = await tx.cycle.findMany({ where: { caisseId: idValide.data, statut: "OUVERT" }, select: { id: true } });
      await tx.cycle.updateMany({ where: { id: { in: cycles.map((c) => c.id) } }, data: { dateDebut: donnees.moisDebut, dateEcheance: champs.dateLimite! } });
      await tx.echeance.updateMany({ where: { cycleId: { in: cycles.map((c) => c.id) } }, data: { montantDu: montantDuParMembre(champs) } });
    }
  });
  await annoncer("Caisse enregistrée ✓");
  redirect(`/caisses/${idValide.data}?vue=caisse`);
}

const schemaStatut = z.object({
  id: schemaIdentifiant,
  statut: z.enum([StatutCaisse.ACTIVE, StatutCaisse.ARCHIVEE]),
});

/** Archive ou réactive une caisse. Jamais de suppression. */
export async function changerStatutCaisse(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const saisie = schemaStatut.safeParse({ id: formData.get("id"), statut: formData.get("statut") });
  if (!saisie.success) return;

  // updateMany + ownerId : met à jour 0 ligne si la caisse n'est pas à elle.
  const { count } = await prisma.caisse.updateMany({ where: { id: saisie.data.id, ownerId }, data: { statut: saisie.data.statut } });
  if (count) await annoncer(saisie.data.statut === "ARCHIVEE" ? "Caisse archivée" : "Caisse réactivée ✓");
  refresh();
}
