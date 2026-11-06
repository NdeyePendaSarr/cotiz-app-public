"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * Repart d'un formulaire vierge à chaque visite par un lien (import, capture). Avec les Cache
 * Components, Next garde une page quittée et la restaure telle quelle (React Activity) : sans cela,
 * revenir sur « Importer une liste » remontrait le résultat du dernier import. bfcacheId change à
 * chaque navigation par lien, mais pas avec le bouton retour : un retour retrouve bien l'aperçu.
 */
export function NeufAChaqueVisite({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
