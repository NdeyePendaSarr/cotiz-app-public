import type { Prisma } from "@/lib/generated/prisma/client";

// Verrous de ligne (audit, lot 1) : sans eux, deux validations simultanées (double appui, deux
// onglets, « Valider les sûrs » envoyé deux fois) lisaient chacune le même reste dû et pouvaient
// affecter plus d'argent qu'il n'y en a. À appeler en tête de transaction : la seconde transaction
// attend la fin de la première, puis relit des données à jour (READ COMMITTED de Postgres).
// Requêtes paramétrées (gabarit $queryRaw), toujours filtrées par ownerId.

type Tx = Prisma.TransactionClient;

/**
 * Verrouille un paiement de l'utilisatrice dans l'un des statuts donnés. Renvoie false s'il n'existe
 * pas, n'est pas à elle ou a changé de statut entre-temps (déjà traité par l'autre transaction).
 */
export async function verrouillerPaiement(tx: Tx, ownerId: string, paiementId: string, statuts: ("A_RAPPROCHER" | "RAPPROCHE" | "IGNORE")[]) {
  const lignes = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM paiements
    WHERE id = ${paiementId}::uuid AND owner_id = ${ownerId}::uuid AND statut::text = ANY(${statuts})
    FOR UPDATE`;
  return lignes.length === 1;
}

/** Verrouille toutes les échéances d'une personne (dans les caisses de l'utilisatrice) avant de lire son reste dû. */
export async function verrouillerEcheancesDePersonne(tx: Tx, ownerId: string, personneId: string) {
  await tx.$queryRaw`
    SELECT e.id FROM echeances e
    JOIN membres_caisse m ON m.id = e.membre_caisse_id
    JOIN caisses c ON c.id = m.caisse_id
    WHERE m.personne_id = ${personneId}::uuid AND c.owner_id = ${ownerId}::uuid
    FOR UPDATE OF e`;
}

/** Verrouille une échéance (dans une caisse de l'utilisatrice) avant de compter ce qui y est déjà affecté. */
export async function verrouillerEcheance(tx: Tx, ownerId: string, echeanceId: string) {
  await tx.$queryRaw`
    SELECT e.id FROM echeances e
    JOIN membres_caisse m ON m.id = e.membre_caisse_id
    JOIN caisses c ON c.id = m.caisse_id
    WHERE e.id = ${echeanceId}::uuid AND c.owner_id = ${ownerId}::uuid
    FOR UPDATE OF e`;
}
