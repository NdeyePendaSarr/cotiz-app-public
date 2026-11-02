import type { Prisma } from "@/lib/generated/prisma/client";

// Origine et datation des paiements (audit, lot 2) : des colonnes, plus des marqueurs dans la note.
// Filtres Prisma partagés, pour que toutes les requêtes parlent la même langue.

/** Versés repris de la colonne « Versé » d'une liste importée, datés ou non. */
export const REPRISE = { origine: "REPRISE_IMPORT" } satisfies Prisma.PaiementWhereInput;

/** Versés repris encore sans vraie date (date de l'import) : exclus du graphique « Reçu par jour ». */
export const REPRISE_NON_DATEE = { origine: "REPRISE_IMPORT", datation: "NON_DATEE" } satisfies Prisma.PaiementWhereInput;

/**
 * Paiement ignoré encore libre pour dater un versé repris : une capture (SMS, saisie), jamais
 * utilisée pour en dater un autre (un SMS « datant » ne revient jamais dans les comptes).
 */
export const CAPTURE_IGNOREE_LIBRE = { statut: "IGNORE", origine: "CAPTURE", dateRepriseId: null } satisfies Prisma.PaiementWhereInput;
