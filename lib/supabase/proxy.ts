import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configSupabase } from "./config";

// Routes accessibles sans session. Tout le reste est privé.
const ROUTES_PUBLIQUES = ["/connexion"];

// Appelée par proxy.ts à chaque requête :
// 1. rafraîchit le jeton Supabase s'il a expiré (et renvoie les nouveaux cookies) ;
// 2. contrôle rapide : sans session, une route privée renvoie vers /connexion.
// Ce n'est PAS la protection principale : exigerUtilisatrice() revérifie côté serveur.
export async function rafraichirSession(request: NextRequest) {
  const { url, clePublique } = configSupabase();
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(url, clePublique, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAPoser, entetes) {
        for (const { name, value } of cookiesAPoser) request.cookies.set(name, value);
        reponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesAPoser) reponse.cookies.set(name, value, options);
        // En-têtes anti-cache : une réponse qui pose un cookie de session ne doit
        // jamais être resservie à quelqu'un d'autre par un CDN.
        for (const [nom, valeur] of Object.entries(entetes)) reponse.headers.set(nom, valeur);
      },
    },
  });

  // getClaims() vérifie la signature du jeton (et le rafraîchit si besoin).
  // Ne rien exécuter entre la création du client et cet appel.
  const { data } = await supabase.auth.getClaims();
  const connectee = Boolean(data?.claims?.sub);
  const chemin = request.nextUrl.pathname;
  const routePublique = ROUTES_PUBLIQUES.includes(chemin);

  if (!connectee && !routePublique) return redirigerVers("/connexion", request, reponse);
  if (connectee && chemin === "/connexion") return redirigerVers("/tableau-de-bord", request, reponse);
  return reponse;
}

// Une redirection doit garder les cookies éventuellement rafraîchis ci-dessus.
function redirigerVers(chemin: string, request: NextRequest, reponse: NextResponse) {
  const redirection = NextResponse.redirect(new URL(chemin, request.url));
  for (const cookie of reponse.cookies.getAll()) redirection.cookies.set(cookie);
  return redirection;
}
