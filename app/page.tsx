import { redirect } from "next/navigation";

// Page de simple redirection : rien à afficher, donc rien à valider pour la navigation
// instantanée (sinon Next signale en dev qu'il ne peut pas rendre ce segment).
export const instant = false;

// « / » : proxy.ts renvoie déjà vers /connexion sans session.
// Avec une session, on arrive ici et on part vers le tableau de bord.
export default function Accueil() {
  redirect("/tableau-de-bord");
}
