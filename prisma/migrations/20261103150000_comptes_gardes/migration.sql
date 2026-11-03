-- Comptes gardés : argent gardé pour une personne (versements et retraits, sans échéance).
-- CreateEnum
CREATE TYPE "SensMouvement" AS ENUM ('VERSEMENT', 'RETRAIT');

-- AlterEnum
ALTER TYPE "TypeCaisse" ADD VALUE 'COMPTE_GARDE';

-- CreateTable
CREATE TABLE "mouvements_compte" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "caisse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "montant" INTEGER NOT NULL,
    "sens" "SensMouvement" NOT NULL,
    "canal" "Canal" NOT NULL,
    "note" VARCHAR(200),
    "paiement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mouvements_compte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mouvements_compte_paiement_id_key" ON "mouvements_compte"("paiement_id");

-- CreateIndex
CREATE INDEX "mouvements_compte_owner_id_caisse_id_date_idx" ON "mouvements_compte"("owner_id", "caisse_id", "date");

-- AddForeignKey
ALTER TABLE "mouvements_compte" ADD CONSTRAINT "mouvements_compte_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_compte" ADD CONSTRAINT "mouvements_compte_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_compte" ADD CONSTRAINT "mouvements_compte_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiements"("id") ON DELETE NO ACTION ON UPDATE CASCADE;



-- Ajouts manuels (règles du projet)
-- RLS sans policy : la table n'est pas exposée par l'API publique de Supabase.
ALTER TABLE "mouvements_compte" ENABLE ROW LEVEL SECURITY;
-- Montant strictement positif (le sens dit si l'argent entre ou sort).
ALTER TABLE "mouvements_compte" ADD CONSTRAINT "mouvements_compte_montant_positif" CHECK ("montant" > 0);
-- Comme dons → paiements : vérifié en fin de transaction (la suppression d'un compte entier reste possible).
ALTER TABLE "mouvements_compte" ALTER CONSTRAINT "mouvements_compte_paiement_id_fkey" DEFERRABLE INITIALLY DEFERRED;
