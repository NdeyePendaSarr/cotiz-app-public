import type { NextRequest } from "next/server";
import { rafraichirSession } from "@/lib/supabase/proxy";

// Next 16 : « proxy » remplace l'ancien « middleware ». Exécuté avant chaque requête ciblée.
export async function proxy(request: NextRequest) {
  return rafraichirSession(request);
}

export const config = {
  // Toutes les routes sauf les fichiers statiques et les images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
