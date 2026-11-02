import "server-only";
import { prisma } from "@/lib/prisma";
import type { PersonneComparee } from "@/lib/validation/personne";

// Couche d'accès aux personnes : toujours filtrée par l'ownerId de l'utilisatrice connectée.

export function listerPersonnes(ownerId: string) {
  return prisma.personne.findMany({
    where: { ownerId },
    orderBy: { nomComplet: "asc" },
    include: {
      numeros: { orderBy: { numero: "asc" } },
      membres: { include: { caisse: { select: { id: true, nom: true, statut: true } } } },
    },
  });
}

/** null si la personne n'existe pas OU appartient à une autre utilisatrice. */
export function obtenirPersonne(ownerId: string, id: string) {
  return prisma.personne.findFirst({
    where: { id, ownerId },
    include: {
      numeros: { orderBy: { numero: "asc" } },
      membres: {
        include: { caisse: { select: { id: true, nom: true, type: true, statut: true } } },
        orderBy: { caisse: { nom: "asc" } },
      },
    },
  });
}

/**
 * Fiche en lecture (audit, lot 2) : échéance de chaque inscription dans le cycle ouvert
 * (montant dû, payé), par id de membre, et les derniers paiements de la personne.
 */
export async function situationPersonne(ownerId: string, personneId: string) {
  const [echeances, paiements] = await Promise.all([
    prisma.echeance.findMany({
      where: { cycle: { statut: "OUVERT" }, membre: { personneId, caisse: { ownerId } } },
      select: { membreCaisseId: true, montantDu: true, allocations: { select: { montant: true } } },
    }),
    prisma.paiement.findMany({
      where: { ownerId, personneId },
      orderBy: { dateReception: "desc" },
      take: 10,
      select: { id: true, montant: true, canal: true, dateReception: true, statut: true },
    }),
  ]);
  const parMembre = new Map(echeances.map((e) => [e.membreCaisseId, { montantDu: e.montantDu, paye: e.allocations.reduce((s, a) => s + a.montant, 0) }]));
  return { parMembre, paiements };
}

/** Personnes comparables + leur éventuelle inscription dans la caisse cible (import). */
export async function listerPersonnesPourImport(ownerId: string, caisseId: string) {
  const personnes = await prisma.personne.findMany({
    where: { ownerId },
    select: {
      id: true,
      nomComplet: true,
      aliasWave: true,
      cellule: true,
      numeros: { select: { numero: true } },
      membres: { where: { caisseId }, select: { statut: true } },
    },
  });
  return personnes.map(({ membres, numeros, ...p }) => ({
    ...p,
    numeros: numeros.map((n) => n.numero),
    membre: membres[0],
  }));
}

/** Forme minimale pour la détection des doublons. */
export async function listerPersonnesComparables(ownerId: string): Promise<PersonneComparee[]> {
  const personnes = await prisma.personne.findMany({
    where: { ownerId },
    select: { id: true, nomComplet: true, aliasWave: true, numeros: { select: { numero: true } } },
  });
  return personnes.map((p) => ({ ...p, numeros: p.numeros.map((n) => n.numero) }));
}
