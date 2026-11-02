// Garde-fous du seed : il efface et recrée des données, et utilise la clé d'administration
// de Supabase. Il ne doit donc JAMAIS viser la production. Fonctions pures, testées.

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** L'URL vise-t-elle cette machine ? (lit le vrai nom d'hôte : « user@127.0.0.1@pirate.com » n'est pas local) */
export function estHoteLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return HOTES_LOCAUX.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Raison du refus, ou null si le seed peut tourner. */
export function verifierEnvironnementSeed(env: { NODE_ENV?: string; DATABASE_URL?: string; NEXT_PUBLIC_SUPABASE_URL?: string }): string | null {
  if (env.NODE_ENV === "production") return "NODE_ENV=production.";
  if (!estHoteLocal(env.DATABASE_URL)) return "DATABASE_URL ne pointe pas vers localhost ou 127.0.0.1.";
  if (!estHoteLocal(env.NEXT_PUBLIC_SUPABASE_URL)) return "NEXT_PUBLIC_SUPABASE_URL ne pointe pas vers localhost ou 127.0.0.1 (le seed utilise la clé d'administration).";
  return null;
}
