-- CreateEnum
CREATE TYPE "OriginePaiement" AS ENUM ('CAPTURE', 'REPRISE_IMPORT');

-- CreateEnum
CREATE TYPE "DatationReprise" AS ENUM ('NON_DATEE', 'PAR_SMS', 'A_LA_MAIN');

-- DropForeignKey
ALTER TABLE "allocations" DROP CONSTRAINT "allocations_echeance_id_fkey";

-- DropForeignKey
ALTER TABLE "dons" DROP CONSTRAINT "dons_paiement_id_fkey";

-- DropForeignKey
ALTER TABLE "echeances" DROP CONSTRAINT "echeances_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "echeances" DROP CONSTRAINT "echeances_membre_caisse_id_fkey";

-- AlterTable
ALTER TABLE "paiements" ADD COLUMN     "datation" "DatationReprise",
ADD COLUMN     "date_reprise_id" UUID,
ADD COLUMN     "origine" "OriginePaiement" NOT NULL DEFAULT 'CAPTURE';

-- CreateTable
CREATE TABLE "tentatives_connexion" (
    "id" BIGSERIAL NOT NULL,
    "cle" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tentatives_connexion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tentatives_connexion_cle_created_at_idx" ON "tentatives_connexion"("cle", "created_at");

-- CreateIndex
CREATE INDEX "allocations_echeance_id_idx" ON "allocations"("echeance_id");

-- CreateIndex
CREATE INDEX "echeances_membre_caisse_id_idx" ON "echeances"("membre_caisse_id");

-- CreateIndex
CREATE INDEX "membres_caisse_personne_id_idx" ON "membres_caisse"("personne_id");

-- CreateIndex
CREATE INDEX "paiements_owner_id_origine_idx" ON "paiements"("owner_id", "origine");

-- CreateIndex
CREATE INDEX "paiements_personne_id_idx" ON "paiements"("personne_id");

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_membre_caisse_id_fkey" FOREIGN KEY ("membre_caisse_id") REFERENCES "membres_caisse"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_date_reprise_id_fkey" FOREIGN KEY ("date_reprise_id") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_echeance_id_fkey" FOREIGN KEY ("echeance_id") REFERENCES "echeances"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dons" ADD CONSTRAINT "dons_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiements"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Ajouts manuels (audit, lot 2)
-- ---------------------------------------------------------------------------------------------

-- Nouvelle table : RLS activée sans policy (jamais lisible avec la clé publique de Supabase).
ALTER TABLE "tentatives_connexion" ENABLE ROW LEVEL SECURITY;

-- Reprise des paiements existants : les marqueurs écrits jusqu'ici dans la note deviennent des colonnes.
UPDATE "paiements" SET "origine" = 'REPRISE_IMPORT', "datation" = 'NON_DATEE' WHERE "note" = 'Repris du tableau importé (déjà versé)';
UPDATE "paiements" SET "origine" = 'REPRISE_IMPORT', "datation" = 'PAR_SMS' WHERE "note" = 'Repris du tableau importé, daté par son SMS';
UPDATE "paiements" SET "origine" = 'REPRISE_IMPORT', "datation" = 'A_LA_MAIN' WHERE "note" = 'Repris du tableau importé, daté à la main';

-- SMS ignorés qui ont daté un versé : le lien était seulement dans le journal d'audit (dernière trace
-- « dateReporteeSur »). Il devient une colonne, vérifiée chez la même trésorière.
UPDATE "paiements" AS p
SET "date_reprise_id" = j.reprise_id
FROM (
  SELECT DISTINCT ON ("entite_id") "entite_id", ("details" ->> 'dateReporteeSur')::uuid AS reprise_id
  FROM "journal_audit"
  WHERE "entite" = 'Paiement' AND "details" ? 'dateReporteeSur'
  ORDER BY "entite_id", "created_at" DESC, "id" DESC
) AS j
WHERE p."note" = 'Même argent qu''un versé importé (sa date y a été reportée)'
  AND p."id"::text = j."entite_id"
  AND EXISTS (SELECT 1 FROM "paiements" r WHERE r."id" = j.reprise_id AND r."owner_id" = p."owner_id");

-- La note redevient libre : on retire les marqueurs techniques désormais portés par les colonnes.
-- (Un SMS « datant » dont le lien n'a pas été retrouvé garde sa note, pour ne rien perdre.)
UPDATE "paiements" SET "note" = NULL
WHERE "note" IN ('Repris du tableau importé (déjà versé)', 'Repris du tableau importé, daté par son SMS', 'Repris du tableau importé, daté à la main')
   OR ("note" = 'Même argent qu''un versé importé (sa date y a été reportée)' AND "date_reprise_id" IS NOT NULL);

-- Montants strictement positifs, garantis par la base (en plus de Zod). NOT VALID : la règle
-- s'applique à toute nouvelle ligne ou modification, sans bloquer la migration sur l'existant.
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_montant_positif" CHECK ("montant" > 0) NOT VALID;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_montant_positif" CHECK ("montant" > 0) NOT VALID;
ALTER TABLE "dons" ADD CONSTRAINT "dons_montant_positif" CHECK ("montant" > 0) NOT VALID;
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_montant_positif" CHECK ("montant" > 0) NOT VALID;
