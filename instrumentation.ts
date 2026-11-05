import type { Instrumentation } from "next";
import { signalerErreur } from "@/lib/erreurs";

// Toute erreur non rattrapée côté serveur (page, Server Action, proxy) laisse une trace dans les
// journaux, avec la référence (digest) affichée sur la page d'erreur. Le chemin est gardé sans ses
// paramètres de requête (une recherche peut contenir un nom ou un numéro).
export const onRequestError: Instrumentation.onRequestError = async (erreur, requete, contexte) => {
  signalerErreur("requete", erreur, { chemin: requete.path.split("?")[0], route: contexte.routePath ?? "", origine: contexte.routeType ?? "" });
};
