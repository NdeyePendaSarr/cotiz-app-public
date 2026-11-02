"use server";

import { redirect } from "next/navigation";
import { connexionBloquee, FENETRE_MINUTES, noterEchec, oublierEchecs } from "@/lib/connexion/tentatives";
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

  // Trop d'essais ratés pour cette adresse : refus sans interroger Supabase (audit, lot 2).
  if (await connexionBloquee(saisie.data.email)) {
    return { erreur: `Trop d'essais. Réessaie dans ${FENETRE_MINUTES} minutes.`, email: emailSaisi };
  }

  const supabase = await creerClientSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: saisie.data.email,
    password: saisie.data.motDePasse,
  });
  // Message volontairement vague : ne pas révéler si l'adresse a un compte.
  if (error) {
    await noterEchec(saisie.data.email);
    return { erreur: "E-mail ou mot de passe incorrect.", email: emailSaisi };
  }
  await oublierEchecs(saisie.data.email);

  redirect("/tableau-de-bord");
}

export async function seDeconnecter() {
  const supabase = await creerClientSupabase();
  await supabase.auth.signOut();
  redirect("/connexion");
}
