import "server-only";
import { cache } from "react";
import type { PaiementComparable } from "@/lib/capture/doublons";
import { ajouterJours } from "@/lib/cycles/dates";
import type { Canal } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

// Accès aux paiements et SMS non lus : toujours filtré par l'ownerId de l'utilisatrice.

export const CHAMPS_RESUME = {
  id: true,
  canal: true,
  source: true,
  montant: true,
  nomExpediteur: true,
  telephoneExpediteur: true,
  dateReception: true,
  reference: true,
  personne: { select: { nomComplet: true } },
} as const;

export function derniersPaiements(ownerId: string, nombre = 5) {
  return prisma.paiement.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: nombre, select: CHAMPS_RESUME });
}

/** Paiements du même canal, du même montant et du même jour : candidats au doublon probable. */
export function paiementsComparables(ownerId: string, canal: Canal, montant: number, date: Date): Promise<PaiementComparable[]> {
  const debut = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return prisma.paiement.findMany({
    where: { ownerId, canal, montant, dateReception: { gte: debut, lt: ajouterJours(debut, 1) } },
    select: {
      id: true,
      canal: true,
      montant: true,
      dateReception: true,
      reference: true,
      telephoneExpediteur: true,
      nomExpediteur: true,
      texteBrut: true,
      personneId: true,
    },
  });
}

/** Personnes qui ont ce numéro (un numéro peut être partagé, ex. un couple). */
export async function personnesDuNumero(ownerId: string, numero: string | null) {
  if (!numero) return [];
  const lignes = await prisma.numeroPersonne.findMany({ where: { ownerId, numero }, select: { personneId: true } });
  return lignes.map((l) => l.personneId);
}

// cache() (audit, lot 3) : lu une seule fois par requête, même si la barre et la page le demandent.
export const compterSmsNonLus = cache((ownerId: string) => prisma.smsNonLu.count({ where: { ownerId, statut: "A_TRAITER" } }));

export function listerSmsNonLus(ownerId: string) {
  return prisma.smsNonLu.findMany({ where: { ownerId, statut: "A_TRAITER" }, orderBy: { dateCollage: "asc" } });
}

export function obtenirSmsNonLu(ownerId: string, id: string) {
  return prisma.smsNonLu.findFirst({ where: { id, ownerId, statut: "A_TRAITER" } });
}

/**
 * Détail d'un paiement et son historique : les lignes du journal d'audit du paiement et
 * de ses allocations (entiteId « paiementId:echeanceId », y compris celles annulées depuis).
 * null si le paiement n'existe pas ou appartient à une autre utilisatrice.
 */
export async function historiquePaiement(ownerId: string, id: string) {
  const paiement = await prisma.paiement.findFirst({
    where: { id, ownerId },
    select: {
      ...CHAMPS_RESUME,
      statut: true,
      datation: true,
      note: true,
      texteBrut: true,
      createdAt: true,
      rapprocheLe: true,
      rembourseLe: true,
      don: { select: { id: true, montant: true, caisseId: true } },
      mouvementCompte: { select: { montant: true, caisse: { select: { id: true, nom: true } } } },
      allocations: {
        orderBy: { echeance: { cycle: { dateEcheance: "asc" } } },
        select: {
          montant: true,
          echeance: { select: { cycle: { select: { numero: true, dateEcheance: true, caisse: { select: { id: true, nom: true } } } } } },
        },
      },
    },
  });
  if (!paiement) return null;
  const journal = await prisma.journalAudit.findMany({
    where: {
      ownerId,
      OR: [
        { entite: "Paiement", entiteId: id },
        { entite: "Allocation", entiteId: { startsWith: `${id}:` } },
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true, entite: true, entiteId: true, action: true, details: true, createdAt: true },
  });

  // Libellé des échéances citées par le journal (même celles dont l'allocation a été annulée).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idsEcheances = [...new Set(journal.map((l) => l.entiteId.split(":")[1]).filter((e): e is string => !!e && UUID.test(e)))];
  const echeances = await prisma.echeance.findMany({
    where: { id: { in: idsEcheances }, cycle: { caisse: { ownerId } } },
    select: { id: true, cycle: { select: { numero: true, caisse: { select: { nom: true } } } } },
  });
  const libellesEcheances = new Map(echeances.map((e) => [e.id, `${e.cycle.caisse.nom}, cycle ${e.cycle.numero}`]));

  return { paiement, journal, libellesEcheances };
}

/** Personnes pour un choix avec recherche : nom, alias, numéros et cellule. */

