-- Bonnes volontés : dons à une collecte, saisis à part ou issus de l'excédent d'un paiement.
-- CreateTable
CREATE TABLE "dons" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "caisse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "montant" INTEGER NOT NULL,
    "donateur" VARCHAR(150) NOT NULL,
    "canal" "Canal" NOT NULL,
    "note" VARCHAR(200),
    "paiement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dons_paiement_id_key" ON "dons"("paiement_id");

-- CreateIndex
CREATE INDEX "dons_owner_id_caisse_id_idx" ON "dons"("owner_id", "caisse_id");

-- AddForeignKey
ALTER TABLE "dons" ADD CONSTRAINT "dons_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dons" ADD CONSTRAINT "dons_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dons" ADD CONSTRAINT "dons_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiements"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- RLS sans policy (règle du projet) : la table n'est pas exposée par l'API publique de Supabase.
ALTER TABLE "dons" ENABLE ROW LEVEL SECURITY;
