// URL et clé publique de Supabase (publiques par nature : elles partent aussi au navigateur).
// La sécurité ne repose pas sur elles : la RLS ferme l'API REST et l'auth vérifie les jetons.

import type { CookieOptions } from "@supabase/ssr";

export function configSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clePublique) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquante (voir .env.example)");
  }
  return { url, clePublique };
}

/** Une session inutilisée expire après 30 jours ; chaque rafraîchissement du jeton la prolonge. */
export const DUREE_COOKIE_SESSION = 30 * 24 * 60 * 60;

/**
 * Réglages de tout cookie de session écrit par Supabase. Appliqués à l'écriture : @supabase/ssr
 * impose ses défauts (lisible par JavaScript, 400 jours) et remplace même un maxAge passé en
 * cookieOptions. Seul le serveur lit la session : aucun code du navigateur n'a besoin du jeton.
 * Un maxAge de 0 (suppression du cookie) est gardé.
 */
export function optionsCookieSession(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: options.maxAge === 0 ? 0 : DUREE_COOKIE_SESSION,
  };
}
