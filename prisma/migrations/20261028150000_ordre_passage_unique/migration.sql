-- Ordre de passage unique dans une caisse (tontines). Les NULL (collectes) ne se gênent pas :
-- PostgreSQL considère deux NULL comme différents dans un index unique.
-- CreateIndex
CREATE UNIQUE INDEX "membres_caisse_caisse_id_ordre_passage_key" ON "membres_caisse"("caisse_id", "ordre_passage");
