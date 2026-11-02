-- Phase 10 : cellule de la commission, portée par la personne (même cellule dans toutes ses caisses).
-- Pas de nouvelle table : la RLS déjà active sur "personnes" s'applique.
ALTER TABLE "personnes" ADD COLUMN "cellule" VARCHAR(50);
