-- Audit, lot 3 : l'argent d'une caisse ne disparaît plus avec elle. Dépenses, bonnes volontés et
-- mouvements d'un compte gardé étaient supprimés en cascade (par exemple depuis un éditeur SQL), et un
-- paiement versé sur un compte redevenait « à rembourser ». Même règle que le reste de l'historique
-- financier : refus en fin de transaction. Supprimer un compte entier reste possible, car ces lignes
-- partent aussi par owner_id dans la même transaction. Aucune donnée n'est modifiée.

ALTER TABLE "depenses" DROP CONSTRAINT "depenses_caisse_id_fkey";
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "dons" DROP CONSTRAINT "dons_caisse_id_fkey";
ALTER TABLE "dons" ADD CONSTRAINT "dons_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "mouvements_compte" DROP CONSTRAINT "mouvements_compte_caisse_id_fkey";
ALTER TABLE "mouvements_compte" ADD CONSTRAINT "mouvements_compte_caisse_id_fkey" FOREIGN KEY ("caisse_id") REFERENCES "caisses"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
