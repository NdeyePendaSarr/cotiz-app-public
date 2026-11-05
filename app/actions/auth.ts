"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { annulerEssai, confirmerEchec, messageBlocage, oublierEchecs, reseauDepuisEntetes, reserverEssai } from "@/lib/connexion/tentatives";
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
  // Pendant le blocage : les minutes restantes, sans prolonger le blocage.
  // L'essai est réservé avant d'interroger Supabase : des requêtes simultanées ne passent pas toutes.
  const reservation = await reserverEssai(origine);
  if ("bloque" in reservation) return { erreur: messageBlocage(reservation.bloque), email: emailSaisi };

  let codeErreur: string | null;
  try {
    const supabase = await creerClientSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: saisie.data.email,
      password: saisie.data.motDePasse,
    });
    codeErreur = error ? (error.code ?? "inconnue") : null;
  } catch {
    codeErreur = "panne";
  }

  // Message volontairement vague : ne pas révéler si l'adresse a un compte.
  if (codeErreur === "invalid_credentials") {
    // L'échec qui déclenche le blocage l'annonce tout de suite (pas seulement à l'essai suivant).
    const blocage = await confirmerEchec(origine);
    return { erreur: blocage !== null ? messageBlocage(blocage) : "E-mail ou mot de passe incorrect.", email: emailSaisi };
  }
  // Panne ou limite de Supabase : ni la faute du mot de passe, ni un essai à compter.
  await annulerEssai(reservation.essai);
  if (codeErreur !== null) return { erreur: "Connexion impossible pour le moment. Réessaie dans un instant.", email: emailSaisi };
  await oublierEchecs(origine);

  redirect("/tableau-de-bord");
}

export async function seDeconnecter() {
  const supabase = await creerClientSupabase();
  await supabase.auth.signOut();
  redirect("/connexion");
}
