-- Compte gardé pour une organisation (association…) : son nom ; ses contacts sont les membres du compte.
-- NULL = compte gardé pour une personne, comme avant. Aucune nouvelle table : RLS inchangée.
ALTER TABLE "caisses" ADD COLUMN     "organisation" VARCHAR(100);

-- Seul un compte gardé peut porter un nom d'organisation, jamais vide.
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_organisation_compte_garde"
  CHECK ("organisation" IS NULL OR ("type" = 'COMPTE_GARDE' AND btrim("organisation") <> ''));
