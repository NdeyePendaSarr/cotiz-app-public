"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { LIBELLES_CANAL } from "@/lib/format";
import { Canal } from "@/lib/generated/prisma/enums";
import { refusCorrectionCanal } from "@/lib/paiements/canal";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { verrouillerPaiement } from "@/lib/verrous";

const schemaCanal = z.enum(Canal);

/**
 * Corrige le canal d'un paiement déclaré par la trésorière (versé repris d'une liste, saisie
 * manuelle), même si sa caisse est terminée. La bonne volonté et le versement sur un compte issus de
 * ce paiement suivent. Revérifié sous verrou ; journal d'audit pour chaque ligne modifiée.
 */
export async function corrigerCanalPaiement(paiementId: string, formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(paiementId);
  const canal = schemaCanal.safeParse(formData.get("canal"));
  if (!id.success || !canal.success) {
    await annoncer("Choisis un canal.");
    return;
  }

  const message = await prisma.$transaction(async (tx) => {
    if (!(await verrouillerPaiement(tx, ownerId, id.data, ["A_RAPPROCHER", "RAPPROCHE", "IGNORE"]))) return "Paiement introuvable.";
    const p = await tx.paiement.findFirst({
      where: { id: id.data, ownerId },
      select: { canal: true, source: true, reference: true, datation: true, don: { select: { id: true } }, mouvementCompte: { select: { id: true } } },
    });
    if (!p) return "Paiement introuvable.";
    const refus = refusCorrectionCanal(p);
    if (refus) return refus;
    if (p.canal === canal.data) return `Ce paiement est déjà en ${LIBELLES_CANAL[canal.data]}.`;

    const details = { canal: canal.data, ancienCanal: p.canal };
    await tx.paiement.updateMany({ where: { id: id.data, ownerId }, data: { canal: canal.data } });
    await journaliser(tx, { ownerId, entite: "Paiement", entiteId: id.data, action: "MODIFICATION", details });
    if (p.don) {
      await tx.don.updateMany({ where: { id: p.don.id, ownerId }, data: { canal: canal.data } });
      await journaliser(tx, { ownerId, entite: "Don", entiteId: p.don.id, action: "MODIFICATION", details });
    }
    if (p.mouvementCompte) {
      await tx.mouvementCompte.updateMany({ where: { id: p.mouvementCompte.id, ownerId }, data: { canal: canal.data } });
      await journaliser(tx, { ownerId, entite: "MouvementCompte", entiteId: p.mouvementCompte.id, action: "MODIFICATION", details });
    }
    return `Canal corrigé : ${LIBELLES_CANAL[p.canal]} → ${LIBELLES_CANAL[canal.data]} ✓`;
  });

  await annoncer(message);
  refresh(); // répartition par canal de l'accueil, page de la caisse
}
