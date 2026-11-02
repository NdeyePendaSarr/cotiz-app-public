import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { creerClientSupabase } from "@/lib/supabase/serveur";
import { nomDepuisEmail } from "@/lib/validation/auth";

export type UtilisatriceConnectee = { id: string; email: string };

// Point de contrôle unique de l'authentification côté serveur.
// À appeler en tête de chaque page privée et de chaque Server Action.
// - Vérifie la signature du jeton Supabase (getClaims), sans faire confiance au client.
// - Redirige vers /connexion s'il n'y a pas de session valide.
// - Ne lit PAS la base (performance, 31/10/2026) : l'identifiant du jeton suffit comme ownerId,
//   et les lectures de la page démarrent tout de suite. Le nom s'obtient avec profilUtilisatrice().
// cache() : un seul contrôle par requête, même si plusieurs composants l'appellent.
export const exigerUtilisatrice = cache(async (): Promise<UtilisatriceConnectee> => {
  // Rendu au moment de la requête uniquement. Avec le Partial Prefetching, Next
  // pré-rend aussi une version par session où cookies() est déjà disponible :
  // sans cette ligne, getClaims() y lirait l'heure (Date.now(), pour l'expiration
  // du jeton), ce qui est interdit pendant un pré-rendu.
  await connection();

  const supabase = await creerClientSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  const email = data?.claims?.email;
  if (error || !id || !email) redirect("/connexion");
  return { id, email };
});

/**
 * Utilisatrice avec son nom d'affichage (en-tête, accueil, profil). Crée sa ligne si le compte
 * Supabase n'en a pas encore (comptes créés dans le tableau de bord Supabase : l'inscription est
 * fermée) ; appelée par le layout, donc dès la première page après la connexion.
 */
export const profilUtilisatrice = cache(async () => {
  const { id, email } = await exigerUtilisatrice();
  const champs = { id: true, email: true, nom: true } as const;
  const existante = await prisma.utilisatrice.findUnique({ where: { id }, select: champs });
  if (existante) return existante;

  // upsert plutôt que create : deux requêtes simultanées ne créent pas de doublon.
  return prisma.utilisatrice.upsert({
    where: { id },
    create: { id, email: email.toLowerCase(), nom: nomDepuisEmail(email) },
    update: {},
    select: champs,
  });
});
