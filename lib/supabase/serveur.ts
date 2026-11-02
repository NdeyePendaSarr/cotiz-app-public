import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configSupabase } from "./config";

// Client Supabase pour les Server Components et les Server Actions.
// La session vit dans des cookies : le serveur la lit à chaque requête.
// Un nouveau client par requête (jamais partagé entre deux utilisatrices).
export async function creerClientSupabase() {
  const { url, clePublique } = configSupabase();
  const magasin = await cookies();

  return createServerClient(url, clePublique, {
    cookies: {
      getAll() {
        return magasin.getAll();
      },
      setAll(cookiesAPoser) {
        try {
          for (const { name, value, options } of cookiesAPoser) magasin.set(name, value, options);
        } catch {
          // Un Server Component ne peut pas écrire de cookie : sans gravité,
          // proxy.ts rafraîchit la session à chaque requête.
        }
      },
    },
  });
}
