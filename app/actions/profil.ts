"use server";

import { refresh } from "next/cache";
import { exigerUtilisatrice } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { schemaNomAffichage } from "@/lib/validation/auth";

export type EtatProfil = { erreur?: string; enregistre?: boolean; nom?: string } | undefined;

/** Nom d'affichage de la trésorière (audit, lot 1) : remplace le nom tiré de l'e-mail. */
export async function modifierNomAffichage(_etat: EtatProfil, formData: FormData): Promise<EtatProfil> {
  const { id } = await exigerUtilisatrice();
  const saisie = schemaNomAffichage.safeParse(formData.get("nom"));
  if (!saisie.success) return { erreur: saisie.error.issues[0].message, nom: String(formData.get("nom") ?? "") };

  // where par id de la session : on ne modifie que sa propre ligne.
  await prisma.utilisatrice.update({ where: { id }, data: { nom: saisie.data } });
  refresh(); // en-tête (initiales) et accueil (« Bonjour … »)
  return { enregistre: true, nom: saisie.data };
}
