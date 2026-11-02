-- Phase 11 : sorties de caisse (dépenses d'une collecte).
-- CreateEnum
CREATE TYPE "CategorieDepense" AS ENUM ('NOURRITURE', 'TRANSPORT', 'MATERIEL', 'LOGEMENT', 'COMMUNICATION', 'AVANCE', 'AUTRE');

-- CreateTable
CREATE TABLE "depenses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "caisse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" VARCHAR(200) NOT NULL,
    "beneficiaire" VARCHAR(150),
    "canal" "Canal" NOT NULL,
    "categorie" "CategorieDepense" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "depenses_owner_id_caisse_id_idx" ON "depenses"("owner_id", "caisse_id");

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS sans policy (règle du projet) : la table n'est pas exposée par l'API publique de Supabase.
ALTER TABLE "depenses" ENABLE ROW LEVEL SECURITY;
