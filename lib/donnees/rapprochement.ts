import "server-only";
import { cache } from "react";
import { ajouterJours } from "@/lib/cycles/dates";
import { Prisma } from "@/lib/generated/prisma/client";
import type { EcheanceDue } from "@/lib/matching/allocation";
import { prisma } from "@/lib/prisma";
import { CHAMPS_RESUME } from "@/lib/donnees/paiements";
import { CAPTURE_IGNOREE_LIBRE, REPRISE_NON_DATEE } from "@/lib/paiements/origine";
import { apparierReprises } from "@/lib/import/datation";
import { identifierPersonne } from "@/lib/matching/personne";

// Données du rapprochement : toujours filtrées par l'ownerId de l'utilisatrice connectée.

const CHAMPS_PAIEMENT = { ...CHAMPS_RESUME, personneId: true, origine: true } as const;

export function paiementsARapprocher(ownerId: string) {
  return prisma.paiement.findMany({ where: { ownerId, statut: "A_RAPPROCHER" }, orderBy: { dateReception: "asc" }, select: CHAMPS_PAIEMENT });
}

export async function personnesPourMatching(ownerId: string) {
  const personnes = await prisma.personne.findMany({
    where: { ownerId },
    orderBy: { nomComplet: "asc" },
    select: { id: true, nomComplet: true, aliasWave: true, cellule: true, numeros: { select: { numero: true } } },
  });
  return personnes.map((p) => ({ ...p, numeros: p.numeros.map((n) => n.numero) }));
}

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Échéances pas entièrement payées, arriérés des cycles clôturés compris (cahier, phase 7),
 * regroupées par personne. Avec un client de transaction, sert aussi à revérifier avant d'écrire.
 */
export async function echeancesDues(client: Client, ownerId: string, personneId?: string) {
  // Une seule requête (audit, lot 3) : seules les échéances encore dues remontent, la somme déjà
  // affectée est calculée par la base. Avant, toutes les échéances (payées comprises) étaient lues
  // puis filtrées en mémoire, et la liste grossissait à chaque cycle. Requête paramétrée.
  const lignes = await client.$queryRaw<
    { id: string; montant_du: number; deja_alloue: number; personne_id: string; numero: number; date_echeance: Date; caisse_nom: string }[]
  >`
    SELECT e.id, e.montant_du, COALESCE(SUM(a.montant), 0)::int AS deja_alloue, m.personne_id, cy.numero, cy.date_echeance, c.nom AS caisse_nom
    FROM echeances e
    JOIN membres_caisse m ON m.id = e.membre_caisse_id
    JOIN caisses c ON c.id = m.caisse_id
    JOIN cycles cy ON cy.id = e.cycle_id
    LEFT JOIN allocations a ON a.echeance_id = e.id
    WHERE c.owner_id = ${ownerId}::uuid ${personneId ? Prisma.sql`AND m.personne_id = ${personneId}::uuid` : Prisma.empty}
    GROUP BY e.id, e.montant_du, m.personne_id, cy.numero, cy.date_echeance, c.nom
    HAVING COALESCE(SUM(a.montant), 0) < e.montant_du`;

  const parPersonne: Record<string, EcheanceDue[]> = {};
  for (const e of lignes) {
    (parPersonne[e.personne_id] ??= []).push({
      id: e.id,
      caisseNom: e.caisse_nom,
      cycleNumero: e.numero,
      dateEcheance: e.date_echeance.toISOString().slice(0, 10),
      montantDu: e.montant_du,
      dejaAlloue: e.deja_alloue,
    });
  }
  return parPersonne;
}

/** Rapprochés depuis 7 jours, avec ce qu'il faut pour savoir s'ils sont encore annulables. */
export function derniersRapproches(ownerId: string) {
  return prisma.paiement.findMany({
    where: { ownerId, statut: "RAPPROCHE", rapprocheLe: { gte: ajouterJours(new Date(), -7) } },
    orderBy: { rapprocheLe: "desc" },
    select: {
      ...CHAMPS_RESUME,
      rapprocheLe: true,
      rembourseLe: true,
      don: { select: { montant: true } },
      allocations: {
        select: { montant: true, echeance: { select: { cycle: { select: { numero: true, statut: true, caisse: { select: { nom: true } } } } } } },
      },
    },
  });
}

export function paiementsIgnores(ownerId: string) {
  return prisma.paiement.findMany({ where: { ownerId, statut: "IGNORE" }, orderBy: { dateReception: "desc" }, take: 30, select: { ...CHAMPS_RESUME, dateRepriseId: true } });
}

/** Paiements ignorés pas encore utilisés pour dater un versé (ni versés repris eux-mêmes). */
const SMS_LIBRE: Prisma.PaiementWhereInput = CAPTURE_IGNOREE_LIBRE;

/**
 * Page « Dater les versés » : versés repris encore sans date, et SMS ignorés libres (avec la
 * personne qu'on y reconnaît) pour les rattacher à la main. Filtré par ownerId.
 */
export async function versesADater(ownerId: string) {
  const [verses, sms, personnes] = await Promise.all([
    prisma.paiement.findMany({
      where: { ownerId, ...REPRISE_NON_DATEE, statut: "RAPPROCHE" },
      orderBy: { personne: { nomComplet: "asc" } },
      select: {
        id: true,
        montant: true,
        canal: true,
        personneId: true,
        personne: { select: { nomComplet: true, numeros: { select: { numero: true }, take: 1 } } },
        allocations: { select: { echeance: { select: { cycle: { select: { caisse: { select: { nom: true } } } } } } } },
      },
    }),
    prisma.paiement.findMany({
      where: { ownerId, ...SMS_LIBRE },
      orderBy: { dateReception: "desc" },
      select: { id: true, montant: true, canal: true, dateReception: true, nomExpediteur: true, telephoneExpediteur: true, personneId: true },
    }),
    personnesPourMatching(ownerId),
  ]);
  return {
    verses: verses.map(({ allocations, ...v }) => ({ ...v, caisse: allocations[0]?.echeance.cycle.caisse.nom ?? null })),
    sms: sms.map((s) => ({ ...s, personneReconnue: identifierPersonne(s, personnes).proposee })),
  };
}

/**
 * Rattrapage après un import : versés repris non datés et SMS ignorés qui sont le même argent
 * (même personne, même montant ou montants additionnés : lib/import/datation.ts). Lecture seule,
 * filtrée par ownerId ; la personne d'un SMS jamais rapproché est retrouvée comme au rapprochement.
 */
export async function datationsPossibles(ownerId: string) {
  const [reprises, sms, personnes] = await Promise.all([
    prisma.paiement.findMany({ where: { ownerId, ...REPRISE_NON_DATEE, statut: "RAPPROCHE", personneId: { not: null } }, select: { id: true, personneId: true, montant: true } }),
    prisma.paiement.findMany({
      where: { ownerId, ...SMS_LIBRE },
      select: { id: true, personneId: true, telephoneExpediteur: true, nomExpediteur: true, montant: true, dateReception: true },
    }),
    personnesPourMatching(ownerId),
  ]);
  return apparierReprises(
    reprises.map((r) => ({ id: r.id, personneId: r.personneId!, montant: r.montant })),
    sms.map((s) => ({ id: s.id, montant: s.montant, dateReception: s.dateReception, personneId: identifierPersonne(s, personnes).proposee })),
  );
}

// cache() (audit, lot 3) : lu une seule fois par requête, même si la barre et la page le demandent.
export const compterARapprocher = cache((ownerId: string) => prisma.paiement.count({ where: { ownerId, statut: "A_RAPPROCHER" } }));
