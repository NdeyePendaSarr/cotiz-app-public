// Styles partagés (lot 2) : définis une fois ici au lieu d'être recopiés page par page.

/** Liste déroulante native (<select>), alignée sur les champs de saisie. */
export const CLASSE_LISTE =
  "h-11 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** Zone de texte (SMS collé, modèles, message de relance, liste à importer), alignée sur les champs. */
export const CLASSE_ZONE_TEXTE =
  "w-full rounded-xl border border-input bg-card p-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Lien ou bouton qui ouvre WhatsApp (relances). */
export const BOUTON_WHATSAPP =
  "flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 px-3 text-sm font-semibold whitespace-nowrap text-primary hover:bg-secondary";

/** Tableau de la version ordinateur : chaque ligne entière ouvre l'élément (lien étiré sur la ligne). */
export const TABLEAU = {
  table: "w-full text-sm",
  entete: "text-left text-xs text-muted-foreground",
  colonne: "py-3 pr-3 font-medium",
  corps: "divide-y divide-border border-t border-border",
  ligne: "relative h-14 transition-colors hover:bg-secondary/50",
} as const;
