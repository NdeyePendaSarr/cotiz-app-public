-- Audit du 16/11/2026 : deux index pour des lectures qui grossissent avec les années.
-- Aucune nouvelle table : RLS inchangée.

-- Journal d'un paiement : recherche « <paiementId>:% » (entités Allocation). En collation
-- en_US.UTF-8, un LIKE par préfixe n'utilise un index qu'avec text_pattern_ops.
CREATE INDEX "journal_audit_entite_id_prefixe_idx" ON "journal_audit"("owner_id", "entite", "entite_id" text_pattern_ops);

-- Accueil (reçus des 7 derniers jours) et détection de doublons à la capture.
CREATE INDEX "paiements_owner_id_date_reception_idx" ON "paiements"("owner_id", "date_reception");
