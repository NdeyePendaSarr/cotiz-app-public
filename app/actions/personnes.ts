"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { assurerEcheanceMembre } from "@/lib/cycles/echeances";
import { listerPersonnesComparables } from "@/lib/donnees/personnes";
import { ordreSuivant } from "@/lib/donnees/membres";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import {
  aDesDoublons,
  chercherDoublons,
  lireFormulairePersonne,
  schemaPersonne,
  type DonneesPersonne,
} from "@/lib/validation/personne";

type ValeursPersonne = ReturnType<typeof lireFormulairePersonne>;

export type EtatFormulairePersonne =
  | {
      erreur?: string;
      erreurs?: Record<string, string>;
      valeurs?: ValeursPersonne;
      /** Doublons trouvés : rien n'est écrit tant que la trésorière n'a pas confirmé. */
      doublons?: {
        memeNumero: { id: string; nomComplet: string; numero: string }[];
        memeNom: { id: string; nomComplet: string }[];
      };
    }
  | undefined;

// Clé d'erreur = chemin du champ : « nomComplet », « numeros.1.numero »…
function erreursParChamp(erreur: z.ZodError) {
  const erreurs: Record<string, string> = {};
  for (const issue of erreur.issues) erreurs[issue.path.join(".") || "formulaire"] ??= issue.message;
  return erreurs;
}

/** Vérifie les doublons ; renvoie l'état à afficher, ou null si on peut enregistrer. */
async function bloquerSiDoublons(
  ownerId: string,
  donnees: DonneesPersonne,
  valeurs: ValeursPersonne,
  formData: FormData,
  idExclu?: string,
): Promise<EtatFormulairePersonne | null> {
  if (formData.get("confirmer") === "oui") return null;
  const doublons = chercherDoublons(
    { nomComplet: donnees.nomComplet, numeros: donnees.numeros.map((n) => n.numero) },
    await listerPersonnesComparables(ownerId),
    idExclu,
  );
  if (!aDesDoublons(doublons)) return null;
  return {
    valeurs,
    doublons: {
      memeNumero: doublons.memeNumero.map((d) => ({ id: d.personne.id, nomComplet: d.personne.nomComplet, numero: d.numero })),
      memeNom: doublons.memeNom.map((p) => ({ id: p.id, nomComplet: p.nomComplet })),
    },
  };
}

/**
 * Crée une personne. Si caisseId est fourni (ajout depuis la page d'une caisse),
 * l'inscrit aussi comme membre, dans la même transaction.
 */
export async function creerPersonne(
  caisseId: string | null,
  _etat: EtatFormulairePersonne,
  formData: FormData,
): Promise<EtatFormulairePersonne> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs = lireFormulairePersonne(formData);
  const saisie = schemaPersonne.safeParse(valeurs);
  if (!saisie.success) return { erreurs: erreursParChamp(saisie.error), valeurs };

  let caisse: { id: string; type: string } | null = null;
  if (caisseId) {
    const id = schemaIdentifiant.safeParse(caisseId);
    caisse = id.success
      ? await prisma.caisse.findFirst({ where: { id: id.data, ownerId, statut: "ACTIVE", type: { not: "COMPTE_GARDE" } }, select: { id: true, type: true } })
      : null;
    if (!caisse) return { erreur: "Caisse introuvable ou archivée.", valeurs };
  }

  const blocage = await bloquerSiDoublons(ownerId, saisie.data, valeurs, formData);
  if (blocage) return blocage;

  const { nomComplet, cellule, aliasWave, numeros } = saisie.data;
  const personne = await prisma.$transaction(async (tx) => {
    const creee = await tx.personne.create({
      data: { ownerId, nomComplet, cellule, aliasWave, numeros: { create: numeros.map((n) => ({ ownerId, ...n })) } },
      select: { id: true },
    });
    if (caisse) {
      const ordrePassage = caisse.type === "TONTINE" ? await ordreSuivant(tx, caisse.id) : null;
      const membre = await tx.membreCaisse.create({ data: { caisseId: caisse.id, personneId: creee.id, ordrePassage }, select: { id: true } });
      await assurerEcheanceMembre(tx, membre.id, caisse.id);
    }
    return creee;
  });

  await annoncer(caisse ? "Personne ajoutée à la caisse ✓" : "Personne enregistrée ✓");
  redirect(caisse ? `/caisses/${caisse.id}` : `/personnes/${personne.id}`);
}

export async function modifierPersonne(
  id: string,
  _etat: EtatFormulairePersonne,
  formData: FormData,
): Promise<EtatFormulairePersonne> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs = lireFormulairePersonne(formData);
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) return { erreur: "Personne introuvable.", valeurs };

  const saisie = schemaPersonne.safeParse(valeurs);
  if (!saisie.success) return { erreurs: erreursParChamp(saisie.error), valeurs };

  const existe = await prisma.personne.count({ where: { id: idValide.data, ownerId } });
  if (!existe) return { erreur: "Personne introuvable.", valeurs };

  const blocage = await bloquerSiDoublons(ownerId, saisie.data, valeurs, formData, idValide.data);
  if (blocage) return blocage;

  const { nomComplet, cellule, aliasWave, numeros } = saisie.data;
  // Les numéros sont remplacés en bloc : plus simple et sûr qu'un calcul de différences.
  await prisma.$transaction(async (tx) => {
    await tx.personne.updateMany({ where: { id: idValide.data, ownerId }, data: { nomComplet, cellule, aliasWave } });
    await tx.numeroPersonne.deleteMany({ where: { personneId: idValide.data, ownerId } });
    await tx.numeroPersonne.createMany({ data: numeros.map((n) => ({ ownerId, personneId: idValide.data, ...n })) });
    await journaliser(tx, {
      ownerId,
      entite: "Personne",
      entiteId: idValide.data,
      action: "MODIFICATION",
      details: { nomComplet, numeros: numeros.map((n) => n.numero), aliasWave },
    });
  });
  await annoncer("Modifications enregistrées ✓");
  redirect(`/personnes/${idValide.data}`);
}
