import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Membres d'une caisse. La caisse est toujours vérifiée par ownerId (MembreCaisse n'a pas
// d'ownerId propre : il hérite de celui de sa caisse).

export function listerMembres(ownerId: string, caisseId: string) {
  return prisma.membreCaisse.findMany({
    where: { caisseId, caisse: { ownerId } },
    include: { personne: { include: { numeros: { orderBy: { numero: "asc" } } } } },
    orderBy: [{ statut: "asc" }, { ordrePassage: "asc" }, { personne: { nomComplet: "asc" } }],
  });
}

/** Prochain ordre de passage : à la suite de tous les membres, inactifs compris (ils gardent le leur). */
export async function ordreSuivant(tx: Prisma.TransactionClient, caisseId: string) {
  const { _max } = await tx.membreCaisse.aggregate({ where: { caisseId }, _max: { ordrePassage: true } });
  return (_max.ordrePassage ?? 0) + 1;
}
