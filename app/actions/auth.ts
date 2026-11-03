"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connexionBloquee, FENETRE_MINUTES, noterEchec, oublierEchecs, reseauDepuisEntetes } from "@/lib/connexion/tentatives";
import { creerClientSupabase } from "@/lib/supabase/serveur";
import { schemaConnexion } from "@/lib/validation/auth";

export type EtatConnexion = { erreur?: string; email?: string } | undefined;

export async function seConnecter(_etat: EtatConnexion, formData: FormData): Promise<EtatConnexion> {
  const saisie = schemaConnexion.safeParse({
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });
  const emailSaisi = String(formData.get("email") ?? "");
  if (!saisie.success) return { erreur: saisie.error.issues[0].message, email: emailSaisi };

  // Trop d'essais ratés pour cette adresse depuis ce réseau, ou pour ce réseau : refus sans
  // interroger Supabase (audit, lot 2 ; voir lib/connexion/tentatives.ts).
  const origine = { email: saisie.data.email, reseau: reseauDepuisEntetes(await headers()) };
  if (await connexionBloquee(origine)) {
    return { erreur: `Trop d'essais. Réessaie dans ${FENETRE_MINUTES} minutes.`, email: emailSaisi };
  }

  const supabase = await creerClientSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: saisie.data.email,
    password: saisie.data.motDePasse,
  });
  // Message volontairement vague : ne pas révéler si l'adresse a un compte.
  if (error) {
    await noterEchec(origine);
    return { erreur: "E-mail ou mot de passe incorrect.", email: emailSaisi };
  }
  await oublierEchecs(origine);

  redirect("/tableau-de-bord");
}

export async function seDeconnecter() {
  const supabase = await creerClientSupabase();
  await supabase.auth.signOut();
  redirect("/connexion");
}
