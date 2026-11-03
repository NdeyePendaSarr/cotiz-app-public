-- AlterEnum
ALTER TYPE "TypeCaisse" ADD VALUE 'MENSUALITE';

-- AlterTable
ALTER TABLE "caisses" ADD COLUMN     "mois_debut" DATE,
ADD COLUMN     "nombre_mois" INTEGER;


-- Mensualité : une durée raisonnable, et un premier mois qui commence le 1er.
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_nombre_mois_valide" CHECK ("nombre_mois" IS NULL OR "nombre_mois" BETWEEN 1 AND 36);
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_mois_debut_premier" CHECK ("mois_debut" IS NULL OR EXTRACT(DAY FROM "mois_debut") = 1);
