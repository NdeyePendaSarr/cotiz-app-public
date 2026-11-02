-- Audit, lot 2 : protection de l'historique financier, vérifiée en FIN DE TRANSACTION.
-- Postgres contrôle une règle NO ACTION à chaque étape d'une suppression en cascade : la suppression
-- d'un compte entier (seed de démo, nettoyage des tests) échouait. Différées, ces règles laissent la
-- cascade tout enlever d'un coup, mais refusent encore toute suppression qui laisserait une échéance
-- sans membre, une allocation sans échéance ou une bonne volonté sans son paiement.
ALTER TABLE "echeances" ALTER CONSTRAINT "echeances_membre_caisse_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "allocations" ALTER CONSTRAINT "allocations_echeance_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "dons" ALTER CONSTRAINT "dons_paiement_id_fkey" DEFERRABLE INITIALLY DEFERRED;
