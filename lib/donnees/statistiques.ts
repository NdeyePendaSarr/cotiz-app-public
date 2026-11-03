import "server-only";
import { ajouterJours } from "@/lib/cycles/dates";
import { prisma } from "@/lib/prisma";
import type { PaiementRecu } from "@/lib/statistiques";

// Données des graphiques de l'accueil (lot 3) : toujours filtrées par l'ownerId de l'utilisatrice connectée.

/**
 * Paiements arrivés depuis `nbJours` jours (aujourd'hui compris), rapprochés ou non ; les SMS
 * ignorés (sans rapport avec les tontines) et l'argent versé sur un compte gardé (pas une cotisation) sont exclus. Seuls la date, le montant, le canal et
 * l'origine (versé repris d'un import encore sans vraie date ?) sont lus.
 */
export async function paiementsRecus(ownerId: string, jour: Date, nbJours = 14): Promise<PaiementRecu[]> {
  const paiements = await prisma.paiement.findMany({
    where: { ownerId, statut: { not: "IGNORE" }, mouvementCompte: null, dateReception: { gte: ajouterJours(jour, 1 - nbJours), lt: ajouterJours(jour, 1) } },
    select: { dateReception: true, montant: true, canal: true, origine: true, datation: true },
  });
  return paiements.map(({ origine, datation, ...p }) => ({ ...p, reprise: origine === "REPRISE_IMPORT" && datation === "NON_DATEE" }));
}
