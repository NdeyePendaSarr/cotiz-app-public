// URL et clé publique de Supabase (publiques par nature : elles partent aussi au navigateur).
// La sécurité ne repose pas sur elles : la RLS ferme l'API REST et l'auth vérifie les jetons.

export function configSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clePublique) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquante (voir .env.example)");
  }
  return { url, clePublique };
}
