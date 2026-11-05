"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { formaterFCFA } from "@/lib/format";
import { StatutCaisse } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { montantDuParMembre } from "@/lib/mensualite";
import { schemaCaisse, schemaIdentifiant, versChampsCaisse } from "@/lib/validation/caisse";
import { verrouillerEcheancesDeCaisse } from "@/lib/verrous";

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
    await journaliser(tx, { ownerId, entite: "Caisse", entiteId: creee.id, action: "CREATION", details: { nom: donnees.nom, type: donnees.type } });
    // Le titulaire est le seul membre d'un compte gardé (sans cycle ni échéance).
    if (titulaireId) {
      const titulaire = await tx.membreCaisse.create({ data: { caisseId: creee.id, personneId: titulaireId }, select: { id: true } });
      await journaliser(tx, { ownerId, entite: "MembreCaisse", entiteId: titulaire.id, action: "CREATION", details: { caisseId: creee.id, personneId: titulaireId } });
    }
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

  // Tontine : le nouveau montant ne vaut que pour les cycles futurs, les échéances existantes
  // gardent leur montantDu (décision du cahier, phase 4). Collecte et mensualité : un seul cycle,
  // donc le même dû pour tout le monde, recalculé (décision du 05/11/2026 pour la collecte).
  const donnees = saisie.data;
  const refus = await prisma.$transaction(async (tx) => {
    let detailsRecalcul = {};
    if (donnees.type === "MENSUALITE" || donnees.type === "COLLECTE") {
      // Verrou d'abord : aucune validation ne peut changer le versé entre le contrôle et le recalcul.
      await verrouillerEcheancesDeCaisse(tx, ownerId, idValide.data);
      const champs = versChampsCaisse(donnees);
      const nouveauDu = montantDuParMembre(champs);
      const avant = await tx.caisse.findFirstOrThrow({ where: { id: idValide.data, ownerId }, select: { montantCotisation: true, nombreMois: true, moisDebut: true } });
      const cycles = await tx.cycle.findMany({ where: { caisseId: idValide.data, statut: "OUVERT" }, select: { id: true } });

      // Clôturée : ses échéances ne sont plus recalculées, ses paramètres ne bougent donc plus.
      if (cycles.length === 0) {
        if (donnees.type === "COLLECTE" && avant.montantCotisation !== champs.montantCotisation) return "Cette collecte est terminée : son montant ne peut plus changer.";
        if (donnees.type === "MENSUALITE" && (avant.montantCotisation !== champs.montantCotisation || avant.nombreMois !== champs.nombreMois || avant.moisDebut?.getTime() !== donnees.moisDebut.getTime())) {
          return "Cette mensualité est clôturée : son montant, sa durée et son premier mois ne peuvent plus changer.";
        }
      }

      // Versé au-delà du nouveau dû : refus (cet argent déjà affecté n'apparaîtrait plus nulle part).
      const echeances = await tx.echeance.findMany({
        where: { cycleId: { in: cycles.map((c) => c.id) } },
        select: { allocations: { select: { montant: true } }, membre: { select: { personne: { select: { nomComplet: true } } } } },
      });
      const depassements = echeances
        .map((e) => ({ nom: e.membre.personne.nomComplet, verse: e.allocations.reduce((s, a) => s + a.montant, 0) }))
        .filter((e) => e.verse > nouveauDu);
      if (depassements.length > 0) {
        const noms = depassements.slice(0, 5).map((e) => `${e.nom} (${formaterFCFA(e.verse)})`).join(", ");
        const autres = depassements.length > 5 ? ` et ${depassements.length - 5} autre(s)` : "";
        return `Impossible : le nouveau dû serait de ${formaterFCFA(nouveauDu)}, mais ont déjà versé plus : ${noms}${autres}. Corrige d'abord leurs rapprochements.`;
      }

      if (donnees.type === "MENSUALITE") {
        await tx.cycle.updateMany({ where: { id: { in: cycles.map((c) => c.id) } }, data: { dateDebut: donnees.moisDebut, dateEcheance: champs.dateLimite! } });
      }
      await tx.echeance.updateMany({ where: { cycleId: { in: cycles.map((c) => c.id) } }, data: { montantDu: nouveauDu } });
      detailsRecalcul = {
        avant: { montantCotisation: avant.montantCotisation, nombreMois: avant.nombreMois, moisDebut: avant.moisDebut?.toISOString().slice(0, 10) ?? null, montantDu: montantDuParMembre({ type: donnees.type, ...avant }) },
        apres: { nombreMois: champs.nombreMois, moisDebut: champs.moisDebut?.toISOString().slice(0, 10) ?? null, montantDu: nouveauDu },
      };
    }
    await tx.caisse.updateMany({ where: { id: idValide.data, ownerId }, data: versChampsCaisse(donnees) });
    await journaliser(tx, {
      ownerId,
      entite: "Caisse",
      entiteId: idValide.data,
      action: "MODIFICATION",
      details: { nom: donnees.nom, montantCotisation: versChampsCaisse(donnees).montantCotisation, ...detailsRecalcul },
    });
    // Collecte : la date limite est l'échéance de son cycle ouvert.
    if (donnees.type === "COLLECTE") {
      await tx.cycle.updateMany({ where: { caisseId: idValide.data, statut: "OUVERT" }, data: { dateEcheance: donnees.dateLimite } });
    }
    return null;
  });
  if (refus) return { erreur: refus, valeurs };
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
  const count = await prisma.$transaction(async (tx) => {
    const resultat = await tx.caisse.updateMany({ where: { id: saisie.data.id, ownerId }, data: { statut: saisie.data.statut } });
    if (resultat.count) await journaliser(tx, { ownerId, entite: "Caisse", entiteId: saisie.data.id, action: "MODIFICATION", details: { statut: saisie.data.statut } });
    return resultat.count;
  });
  if (count) await annoncer(saisie.data.statut === "ARCHIVEE" ? "Caisse archivée" : "Caisse réactivée ✓");
  refresh();
}
