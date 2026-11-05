import "server-only";
import { cache } from "react";
import type { EcheanceSuivie } from "@/lib/suivi/cycle";
import { MAX_CYCLES_HISTORIQUE, type EntreeHistorique } from "@/lib/suivi/historique";
import type { Prisma } from "@/lib/generated/prisma/client";
import { REPRISE } from "@/lib/paiements/origine";
import { prisma } from "@/lib/prisma";
import { CHAMPS_RESUME } from "@/lib/donnees/paiements";
import { collecteDuDon, excedentPaiement } from "@/lib/dons";

// Données du suivi d'une caisse et des excédents : toujours filtrées par ownerId.

const CHAMPS_HISTORIQUE = {
  montantDu: true,
  allocations: { select: { montant: true } },
  cycle: { select: { numero: true, statut: true } },
} as const;

/** Historique d'une caisse (lot 4) : chaque échéance de chaque cycle, une ligne par membre. */
export async function historiqueCaisse(ownerId: string, caisseId: string): Promise<EntreeHistorique[]> {
  // Seulement les cycles affichés (les plus récents), lus en base plutôt que filtrés après coup (audit, lot 3).
  const cycles = await prisma.cycle.findMany({
    where: { caisseId, caisse: { ownerId } },
    orderBy: { numero: "desc" },
    take: MAX_CYCLES_HISTORIQUE,
    select: { id: true },
  });
  const echeances = await prisma.echeance.findMany({
    where: { cycleId: { in: cycles.map((c) => c.id) } },
    select: { ...CHAMPS_HISTORIQUE, membre: { select: { id: true, statut: true, ordrePassage: true, personne: { select: { nomComplet: true } } } } },
  });
  return echeances.map((e) => ({
    ligneId: e.membre.id,
    libelle: e.membre.personne.nomComplet,
    ordre: e.membre.ordrePassage,
    actif: e.membre.statut === "ACTIF",
    cycleNumero: e.cycle.numero,
    cycleOuvert: e.cycle.statut === "OUVERT",
    montantDu: e.montantDu,
    paye: e.allocations.reduce((s, a) => s + a.montant, 0),
  }));
}

/** Historique d'une personne (lot 4) : ses échéances dans chaque caisse, une ligne par caisse. */
export async function historiquePersonne(ownerId: string, personneId: string): Promise<EntreeHistorique[]> {
  const echeances = await prisma.echeance.findMany({
    where: { membre: { personneId, caisse: { ownerId } } },
    select: { ...CHAMPS_HISTORIQUE, membre: { select: { statut: true, caisse: { select: { id: true, nom: true } } } } },
  });
  return echeances.map((e) => ({
    ligneId: e.membre.caisse.id,
    libelle: e.membre.caisse.nom,
    ordre: null,
    actif: e.membre.statut === "ACTIF",
    cycleNumero: e.cycle.numero,
    cycleOuvert: e.cycle.statut === "OUVERT",
    montantDu: e.montantDu,
    paye: e.allocations.reduce((s, a) => s + a.montant, 0),
  }));
}

/**
 * Personnes déjà payées par un versé repris d'une liste importée, sur un cycle ouvert : montant
 * repris par personne. Un SMS de ces personnes est souvent le même argent (doublon de l'import).
 */
export async function payeesParImport(client: Prisma.TransactionClient | typeof prisma, ownerId: string, personneIds?: string[]) {
  const reprises = await client.paiement.findMany({
    where: {
      ownerId,
      ...REPRISE,
      statut: "RAPPROCHE",
      personneId: personneIds ? { in: personneIds } : { not: null },
      allocations: { some: { echeance: { cycle: { statut: "OUVERT" } } } },
    },
    select: { personneId: true, montant: true },
  });
  const parPersonne: Record<string, number> = {};
  for (const p of reprises) if (p.personneId) parPersonne[p.personneId] = (parPersonne[p.personneId] ?? 0) + p.montant;
  return parPersonne;
}

/** Total des paiements de la personne reçus depuis une date (hors paiements ignorés), net des excédents remboursés. */
export async function verseDepuis(ownerId: string, personneId: string, depuis: Date) {
  // L'argent qu'elle confie sur un compte gardé n'est pas une cotisation : exclu.
  const paiements = { ownerId, personneId, statut: { not: "IGNORE" }, mouvementCompte: null, dateReception: { gte: depuis } } satisfies Prisma.PaiementWhereInput;
  const [{ _sum }, rembourses] = await Promise.all([
    prisma.paiement.aggregate({ where: paiements, _sum: { montant: true } }),
    // Un excédent remboursé est de l'argent rendu : il n'est plus versé.
    prisma.paiement.findMany({
      where: { ...paiements, rembourseLe: { not: null } },
      select: { montant: true, allocations: { select: { montant: true } }, don: { select: { montant: true } } },
    }),
  ]);
  const rendu = rembourses.reduce((s, p) => s + Math.max(0, excedentPaiement(p.montant, p.allocations, p.don)), 0);
  return (_sum.montant ?? 0) - rendu;
}

/**
 * Cycle à suivre : le cycle ouvert, sinon le dernier clôturé (collecte terminée), avec ses
 * échéances, ce qui y est payé, et les arriérés de chaque membre sur les cycles clôturés.
 */
export async function suiviCaisse(ownerId: string, caisseId: string) {
  const cycle = await prisma.cycle.findFirst({
    where: { caisseId, caisse: { ownerId } },
    orderBy: [{ statut: "asc" }, { numero: "desc" }], // OUVERT avant CLOTURE
  });
  if (!cycle) return null;

  const [echeances, anciennes] = await Promise.all([
    prisma.echeance.findMany({
      where: { cycleId: cycle.id },
      select: {
        montantDu: true,
        allocations: { select: { montant: true } },
        membre: {
          select: {
            id: true,
            statut: true,
            ordrePassage: true,
            personne: { select: { id: true, nomComplet: true, cellule: true, numeros: { select: { numero: true }, orderBy: { numero: "asc" } } } },
          },
        },
      },
    }),
    // Arriérés : échéances des cycles clôturés de cette caisse, pas entièrement payées.
    prisma.echeance.findMany({
      where: { cycle: { caisseId, statut: "CLOTURE", NOT: { id: cycle.id } } },
      select: { membreCaisseId: true, montantDu: true, allocations: { select: { montant: true } } },
    }),
  ]);

  const arrieres = new Map<string, number>();
  for (const e of anciennes) {
    const reste = e.montantDu - e.allocations.reduce((s, a) => s + a.montant, 0);
    if (reste > 0) arrieres.set(e.membreCaisseId, (arrieres.get(e.membreCaisseId) ?? 0) + reste);
  }

  const lignes: EcheanceSuivie[] = echeances.map((e) => ({
    membreId: e.membre.id,
    personneId: e.membre.personne.id,
    nom: e.membre.personne.nomComplet,
    ordre: e.membre.ordrePassage,
    membreActif: e.membre.statut === "ACTIF",
    numeros: e.membre.personne.numeros.map((n) => n.numero),
    cellule: e.membre.personne.cellule,
    montantDu: e.montantDu,
    paye: e.allocations.reduce((s, a) => s + a.montant, 0),
    arriere: arrieres.get(e.membre.id) ?? 0,
  }));
  // Sur toute la caisse : un membre retiré sans échéance sur ce cycle n'a pas de ligne, mais doit encore.
  const totalArrieres = [...arrieres.values()].reduce((s, n) => s + n, 0);
  return { cycle, lignes, totalArrieres };
}

/** Cycles ouverts des caisses actives, échéance la plus proche d'abord (tableau de bord). */
export async function cyclesOuverts(ownerId: string) {
  const cycles = await prisma.cycle.findMany({
    where: { statut: "OUVERT", caisse: { ownerId, statut: "ACTIVE" } },
    orderBy: { dateEcheance: "asc" },
    select: {
      id: true,
      numero: true,
      dateDebut: true,
      dateEcheance: true,
      caisse: { select: { id: true, nom: true, type: true, montantCotisation: true, moisDebut: true, nombreMois: true } },
      echeances: { select: { montantDu: true, allocations: { select: { montant: true } }, membre: { select: { statut: true } } } },
    },
  });
  return cycles.map(({ echeances, ...c }) => ({
    ...c,
    echeances: echeances.map((e) => ({ montantDu: e.montantDu, paye: e.allocations.reduce((s, a) => s + a.montant, 0), membreActif: e.membre.statut === "ACTIF" })),
  }));
}

export function listerCaissesPourSelecteur(ownerId: string) {
  return prisma.caisse.findMany({ where: { ownerId }, orderBy: [{ statut: "asc" }, { nom: "asc" }], select: { id: true, nom: true, statut: true } });
}

/**
 * Paiements rapprochés dont une partie n'a servi à aucune échéance ni à une bonne volonté, pas
 * encore remboursée ; avec la collecte où cet excédent peut devenir une bonne volonté.
 */
export async function excedentsARembourser(ownerId: string) {
  const paiements = await prisma.paiement.findMany({
    where: { ownerId, statut: "RAPPROCHE", rembourseLe: null },
    orderBy: { dateReception: "asc" },
    select: {
      ...CHAMPS_RESUME,
      personneId: true,
      don: { select: { montant: true } },
      mouvementCompte: { select: { montant: true } },
      allocations: { select: { montant: true, echeance: { select: { cycle: { select: { caisse: { select: { id: true, nom: true, type: true, statut: true } } } } } } } },
    },
  });
  return paiements
    .map(({ allocations, don, mouvementCompte, ...p }) => ({
      ...p,
      excedent: excedentPaiement(p.montant, allocations, don, mouvementCompte),
      collecte: don ? null : collecteDuDon(allocations),
      /** Réparti sur aucune échéance et sans bonne volonté : tout le paiement est en trop. */
      sansRepartition: allocations.length === 0 && !don,
    }))
    .filter((p) => p.excedent > 0);
}

/**
 * Nombre d'excédents à rembourser (compteur de la navigation, lu à chaque page) : calculé par la
 * base, sans charger les paiements. Même règle que excedentPaiement() (lib/dons.ts) ; un test
 * d'intégration vérifie que les deux comptent pareil.
 */
// cache() (audit, lot 3) : lu une seule fois par requête, même si la barre et la page le demandent.
export const compterARembourser = cache(async (ownerId: string) => {
  const [{ nombre }] = await prisma.$queryRaw<[{ nombre: number }]>`
    SELECT count(*)::int AS nombre
    FROM paiements p
    WHERE p.owner_id = ${ownerId}::uuid
      AND p.statut = 'RAPPROCHE'
      AND p.rembourse_le IS NULL
      AND p.montant > COALESCE((SELECT sum(a.montant) FROM allocations a WHERE a.paiement_id = p.id), 0)
                    + COALESCE((SELECT d.montant FROM dons d WHERE d.paiement_id = p.id), 0)
                    + COALESCE((SELECT m.montant FROM mouvements_compte m WHERE m.paiement_id = p.id), 0)`;
  return nombre;
});
