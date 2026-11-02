-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TypeCaisse" AS ENUM ('TONTINE', 'COLLECTE');

-- CreateEnum
CREATE TYPE "Frequence" AS ENUM ('HEBDOMADAIRE', 'BIMENSUELLE', 'MENSUELLE');

-- CreateEnum
CREATE TYPE "StatutCaisse" AS ENUM ('ACTIVE', 'ARCHIVEE');

-- CreateEnum
CREATE TYPE "StatutMembre" AS ENUM ('ACTIF', 'INACTIF');

-- CreateEnum
CREATE TYPE "StatutCycle" AS ENUM ('OUVERT', 'CLOTURE');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('WAVE', 'ORANGE_MONEY', 'CASH');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('SMS_WAVE', 'SAISIE_MANUELLE');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('A_RAPPROCHER', 'RAPPROCHE', 'IGNORE');

-- CreateEnum
CREATE TYPE "StatutSmsNonLu" AS ENUM ('A_TRAITER', 'TRAITE');

-- CreateTable
CREATE TABLE "utilisatrices" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisatrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "montant_cotisation" INTEGER NOT NULL,
    "type" "TypeCaisse" NOT NULL DEFAULT 'TONTINE',
    "frequence" "Frequence",
    "date_limite" DATE,
    "jour_echeance" INTEGER,
    "modele_relance" TEXT,
    "statut" "StatutCaisse" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caisses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "nom_complet" VARCHAR(150) NOT NULL,
    "alias_wave" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numeros_personne" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "personne_id" UUID NOT NULL,
    "numero" VARCHAR(9) NOT NULL,
    "libelle" VARCHAR(50),

    CONSTRAINT "numeros_personne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membres_caisse" (
    "id" UUID NOT NULL,
    "caisse_id" UUID NOT NULL,
    "personne_id" UUID NOT NULL,
    "ordre_passage" INTEGER,
    "statut" "StatutMembre" NOT NULL DEFAULT 'ACTIF',
    "date_entree" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" UUID NOT NULL,
    "caisse_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_echeance" DATE NOT NULL,
    "statut" "StatutCycle" NOT NULL DEFAULT 'OUVERT',
    "date_cloture" TIMESTAMP(3),
    "beneficiaire_id" UUID,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeances" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "membre_caisse_id" UUID NOT NULL,
    "montant_du" INTEGER NOT NULL,

    CONSTRAINT "echeances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "personne_id" UUID,
    "canal" "Canal" NOT NULL,
    "source" "Source" NOT NULL,
    "montant" INTEGER NOT NULL,
    "nom_expediteur" VARCHAR(150),
    "telephone_expediteur" VARCHAR(9),
    "reference" VARCHAR(100),
    "date_reception" TIMESTAMP(3) NOT NULL,
    "texte_brut" TEXT,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'A_RAPPROCHER',
    "note" TEXT,
    "rembourse_le" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "paiement_id" UUID NOT NULL,
    "echeance_id" UUID NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("paiement_id","echeance_id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" UUID NOT NULL,
    "entite" VARCHAR(50) NOT NULL,
    "entite_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_non_lus" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "texte_brut" TEXT NOT NULL,
    "date_collage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutSmsNonLu" NOT NULL DEFAULT 'A_TRAITER',

    CONSTRAINT "sms_non_lus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisatrices_email_key" ON "utilisatrices"("email");

-- CreateIndex
CREATE INDEX "caisses_owner_id_idx" ON "caisses"("owner_id");

-- CreateIndex
CREATE INDEX "personnes_owner_id_idx" ON "personnes"("owner_id");

-- CreateIndex
CREATE INDEX "numeros_personne_owner_id_numero_idx" ON "numeros_personne"("owner_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "numeros_personne_personne_id_numero_key" ON "numeros_personne"("personne_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "membres_caisse_caisse_id_personne_id_key" ON "membres_caisse"("caisse_id", "personne_id");

-- CreateIndex
CREATE UNIQUE INDEX "cycles_caisse_id_numero_key" ON "cycles"("caisse_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "echeances_cycle_id_membre_caisse_id_key" ON "echeances"("cycle_id", "membre_caisse_id");

-- CreateIndex
CREATE INDEX "paiements_owner_id_statut_idx" ON "paiements"("owner_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_owner_id_canal_reference_key" ON "paiements"("owner_id", "canal", "reference");

-- CreateIndex
CREATE INDEX "journal_audit_owner_id_entite_entite_id_idx" ON "journal_audit"("owner_id", "entite", "entite_id");

-- CreateIndex
CREATE INDEX "sms_non_lus_owner_id_statut_idx" ON "sms_non_lus"("owner_id", "statut");

-- AddForeignKey
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnes" ADD CONSTRAINT "personnes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numeros_personne" ADD CONSTRAINT "numeros_personne_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numeros_personne" ADD CONSTRAINT "numeros_personne_personne_id_fkey" FOREIGN KEY ("personne_id") REFERENCES "personnes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres_caisse" ADD CONSTRAINT "membres_caisse_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres_caisse" ADD CONSTRAINT "membres_caisse_personne_id_fkey" FOREIGN KEY ("personne_id") REFERENCES "personnes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances" ADD CONSTRAINT "echeances_membre_caisse_id_fkey" FOREIGN KEY ("membre_caisse_id") REFERENCES "membres_caisse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_personne_id_fkey" FOREIGN KEY ("personne_id") REFERENCES "personnes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_paiement_id_fkey" FOREIGN KEY ("paiement_id") REFERENCES "paiements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_echeance_id_fkey" FOREIGN KEY ("echeance_id") REFERENCES "echeances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_non_lus" ADD CONSTRAINT "sms_non_lus_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisatrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Sécurité Supabase : Row Level Security ─────────────────────────────────
-- Supabase expose le schéma public via son API REST (PostgREST) avec la clé publique.
-- On active la RLS sur chaque table SANS créer de policy : l'API publique (rôles
-- anon et authenticated) ne voit et ne modifie alors aucune ligne.
-- L'application passe par Prisma avec le rôle postgres, propriétaire des tables et
-- doté de BYPASSRLS : elle n'est pas concernée. Le cloisonnement entre utilisatrices
-- est assuré dans le code (filtre ownerId sur chaque requête).
ALTER TABLE "utilisatrices"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "caisses"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "personnes"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "numeros_personne" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membres_caisse"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cycles"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "echeances"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "paiements"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "allocations"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_audit"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sms_non_lus"      ENABLE ROW LEVEL SECURITY;
-- Table de suivi créée par Prisma avant d'appliquer cette migration : elle aussi dans public.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
