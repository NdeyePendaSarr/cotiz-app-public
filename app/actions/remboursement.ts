"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { payeesParImport } from "@/lib/donnees/suivi";
import { excedentPaiement } from "@/lib/dons";
import { prisma } from "@/lib/prisma";
import { verrouillerPaiement } from "@/lib/verrous";
import { schemaIdentifiant } from "@/lib/validation/caisse";

/** Marque l'excédent d'un paiement comme remboursé (date + journal d'audit). */
export async function marquerRembourse(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("paiementId"));
  if (!id.success) return;

  await prisma.$transaction(async (tx) => {
    if (!(await verrouillerPaiement(tx, ownerId, id.data, ["RAPPROCHE"]))) return;
    const paiement = await tx.paiement.findFirst({
      where: { id: id.data, ownerId, statut: "RAPPROCHE", rembourseLe: null },
      select: { montant: true, allocations: { select: { montant: true } }, don: { select: { montant: true } } },
    });
    if (!paiement) return;
    // La part gardée en bonne volonté n'est pas à rembourser (même règle que la page « À rembourser »).
    const excedent = excedentPaiement(paiement.montant, paiement.allocations, paiement.don);
    if (excedent <= 0) return;
    await tx.paiement.update({ where: { id: id.data }, data: { rembourseLe: new Date() } });
    await journaliser(tx, { ownerId, entite: "Paiement", entiteId: id.data, action: "MODIFICATION", details: { rembourse: excedent } });
  });
  await annoncer("Excédent marqué remboursé ✓");
  refresh();
}

const schemaDoublons = z.array(schemaIdentifiant).min(1).max(100);

/**
 * Doublons de l'import : un SMS validé pour une personne déjà payée par la colonne « Versé » d'une
 * liste importée (le même argent compté deux fois). Le paiement, réparti sur aucune échéance, est
 * remis hors des comptes (« ignoré », réversible). Revérifié ici pour chacun, dans sa transaction :
 * à toi, rapproché, sans allocation, sans bonne volonté, pas remboursé, pas lui-même une reprise,
 * et sa personne a bien un versé repris sur un cycle ouvert.
 */
export async function ignorerDoublons(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const ids = schemaDoublons.safeParse(formData.getAll("paiementId"));
  if (!ids.success) return;

  let ignores = 0;
  for (const id of new Set(ids.data)) {
    const fait = await prisma.$transaction(async (tx) => {
      const paiement = await tx.paiement.findFirst({
        where: {
          id,
          ownerId,
          statut: "RAPPROCHE",
          rembourseLe: null,
          personneId: { not: null },
          origine: "CAPTURE",
          allocations: { none: {} },
          don: { is: null },
        },
        select: { id: true, personneId: true },
      });
      if (!paiement?.personneId) return false;
      const repris = await payeesParImport(tx, ownerId, [paiement.personneId]);
      if (!repris[paiement.personneId]) return false;
      await tx.paiement.update({ where: { id: paiement.id }, data: { statut: "IGNORE", rapprocheLe: null } });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: paiement.id, action: "MODIFICATION", details: { statut: "IGNORE", doublonImport: true } });
      return true;
    });
    if (fait) ignores++;
  }
  await annoncer(`${ignores} doublon${ignores > 1 ? "s" : ""} de la liste importée ignoré${ignores > 1 ? "s" : ""} ✓`);
  refresh();
}
