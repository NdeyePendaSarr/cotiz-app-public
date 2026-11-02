import "server-only";
import { cookies } from "next/headers";

// Message de confirmation après une action réussie (audit, lot 1) : « Paiement rapproché ✓ ».
// Déposé dans un cookie de courte durée, lu et effacé par le composant Annonce (layout privé).
// Le cookie est lisible par le navigateur : il ne contient qu'un texte d'interface, jamais de donnée.

export const COOKIE_ANNONCE = "cotiz_annonce";

/** À appeler après une mutation réussie, avant refresh() ou redirect(). Sans effet hors requête (tests). */
export async function annoncer(message: string) {
  try {
    // Pas d'encodeURIComponent ici : Next encode déjà la valeur du cookie (le navigateur la décode une fois).
    (await cookies()).set(COOKIE_ANNONCE, `${Date.now()}|${message}`, {
      path: "/",
      maxAge: 30,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Pas de requête en cours (tests d'intégration) : rien à annoncer.
  }
}
