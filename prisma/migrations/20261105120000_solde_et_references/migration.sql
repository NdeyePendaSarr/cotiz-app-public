-- Audit, lot 1 : reprise de données, sans changement de schéma.

-- 1. Purge du solde déjà stocké (la règle : jamais stocké). L'ancien filtre ne retirait que les
-- lignes commençant par « Nouveau solde » : SMS Orange Money, SMS collé d'un bloc et valeur
-- renvoyée à la ligne suivante le gardaient. Même motif que MENTION_SOLDE (lib/parsers/smsWave.ts).
-- La fonction est temporaire : supprimée à la fin de cette migration.
CREATE FUNCTION pg_temp.sans_solde(texte text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          texte,
          '\y((votre|nouveau)\s+)*solde\y[^0-9\r\n]{0,40}(\r?\n[ \t]*)?[0-9]([0-9.,]|[ \t  ](?=[0-9]))*([ \t  ]*(FCFA|F\s?CFA|XOF|F))?(?![0-9A-Za-z/])',
          E'\n', 'gi'
        ),
        '^[ \t  ]*nouveau\s+solde[^\r\n]*\r?\n?', '', 'gin'
      ),
      E'(\r?\n)([ \t]*\r?\n)+', E'\\1', 'g'
    ),
    E' \t\r\n'
  )
$$;

UPDATE "paiements" SET "texte_brut" = pg_temp.sans_solde("texte_brut") WHERE "texte_brut" ~* '\ysolde\y';
UPDATE "sms_non_lus" SET "texte_brut" = pg_temp.sans_solde("texte_brut") WHERE "texte_brut" ~* '\ysolde\y';
-- « Compléter depuis le SMS » recopie le texte dans le journal d'audit.
UPDATE "journal_audit"
SET "details" = jsonb_set("details"::jsonb, '{texteBrut}', to_jsonb(pg_temp.sans_solde("details"::jsonb ->> 'texteBrut')))
WHERE jsonb_typeof("details"::jsonb) = 'object' AND "details"::jsonb ->> 'texteBrut' ~* '\ysolde\y';

-- 2. Références Wave saisies à la main, ramenées à la forme des SMS (« T_QWE…-IOP… » → « TQWE…IOP… »).
-- Si la forme normalisée existe déjà, c'est sans doute le même argent enregistré deux fois : rien
-- n'est fusionné ni déduit, ces lignes gardent leur référence pour que la trésorière tranche.
WITH candidats AS (
  SELECT
    p."id",
    upper(regexp_replace(p."reference", '[\s_-]', '', 'g')) AS normalisee,
    row_number() OVER (
      PARTITION BY p."owner_id", upper(regexp_replace(p."reference", '[\s_-]', '', 'g'))
      ORDER BY p."created_at", p."id"
    ) AS rang
  FROM "paiements" p
  WHERE p."canal" = 'WAVE'
    AND p."reference" IS NOT NULL
    AND p."reference" <> upper(regexp_replace(p."reference", '[\s_-]', '', 'g'))
)
UPDATE "paiements" p
SET "reference" = c.normalisee
FROM candidats c
WHERE p."id" = c."id"
  AND c.rang = 1
  AND c.normalisee <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "paiements" autre
    WHERE autre."owner_id" = p."owner_id" AND autre."canal" = 'WAVE' AND autre."reference" = c.normalisee
  );

DROP FUNCTION pg_temp.sans_solde(text);
