-- Un seul cycle OUVERT par caisse : index unique partiel (ne porte que sur les lignes OUVERT).
-- Déclaré dans schema.prisma grâce à la fonctionnalité expérimentale « partialIndexes ».
-- CreateIndex
CREATE UNIQUE INDEX "cycles_un_seul_ouvert" ON "cycles"("caisse_id") WHERE (statut = 'OUVERT');
