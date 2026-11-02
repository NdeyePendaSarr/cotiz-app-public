import "server-only";
import { prisma } from "@/lib/prisma";

// Couche d'accès aux caisses. Chaque fonction exige l'ownerId de l'utilisatrice
// connectée (obtenu par exigerUtilisatrice()) : impossible de lire la caisse d'une autre.

export function listerCaisses(ownerId: string) {
  return prisma.caisse.findMany({
    where: { ownerId },
    orderBy: [{ statut: "asc" }, { nom: "asc" }], // ACTIVE avant ARCHIVEE
    include: { _count: { select: { membres: { where: { statut: "ACTIF" } } } } },
  });
}

/** null si la caisse n'existe pas OU appartient à une autre utilisatrice (même réponse). */
export function obtenirCaisse(ownerId: string, id: string) {
  return prisma.caisse.findFirst({
    where: { id, ownerId },
    include: { _count: { select: { membres: { where: { statut: "ACTIF" } } } } },
  });
}
