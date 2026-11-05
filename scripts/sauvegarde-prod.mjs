// Sauvegarde de la base : npm run db:sauvegarde (lit .env.prod, seule commande avec db:migrate:prod).
// À lancer chaque semaine et avant chaque migration. Voir « Sauvegardes » dans le README.
//
// Trois fichiers, jamais dans le dépôt :
//   …-public.dump     toutes les tables de l'application (dont les numéros de téléphone) ;
//   …-comptes.dump    comptes Supabase (auth.users, auth.identities : empreintes de mots de passe) ;
//   …-manifeste.json  nombre de lignes par table, pour vérifier une restauration (aucune donnée).
// Destination : SAUVEGARDE_DOSSIER (par défaut ~/cotiz-sauvegardes). Copie : SAUVEGARDE_COPIE (clé USB
// ou disque externe chiffré), car une sauvegarde gardée seulement sur le poste disparaîtrait avec lui.

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { compterLignes, dansPostgres, dossierSauvegardes, urlPourConteneur } from "./sauvegarde-commun.mjs";

async function principal() {
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL manquante : lance plutôt npm run db:sauvegarde.");
  const url = urlPourConteneur(process.env.DIRECT_URL);

  const dossier = resolve(dossierSauvegardes());
  const dansDepot = !relative(process.cwd(), dossier).startsWith("..");
  if (dansDepot) throw new Error("SAUVEGARDE_DOSSIER est dans le dépôt : une sauvegarde n'y va jamais.");
  mkdirSync(dossier, { recursive: true });

  const date = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const nom = (suffixe) => `cotiz-${date}-${suffixe}`;
  const fichiers = [nom("public.dump"), nom("comptes.dump"), nom("manifeste.json")];

  console.log("Comptage des lignes…");
  const lignes = await compterLignes(url);
  console.log("Sauvegarde des tables de l'application…");
  await dansPostgres(`pg_dump "$BASE" --format=custom --schema=public --no-owner --no-privileges`, { url, fichier: join(dossier, fichiers[0]) });
  console.log("Sauvegarde des comptes…");
  await dansPostgres(`pg_dump "$BASE" --format=custom --data-only --table=auth.users --table=auth.identities --no-owner --no-privileges`, { url, fichier: join(dossier, fichiers[1]) });
  writeFileSync(join(dossier, fichiers[2]), `${JSON.stringify({ date: new Date().toISOString(), public: fichiers[0], comptes: fichiers[1], lignes }, null, 2)}\n`);

  for (const f of fichiers) if (statSync(join(dossier, f)).size === 0) throw new Error(`Fichier vide : ${f}.`);
  console.log(`Sauvegarde faite dans ${dossier} : ${Object.keys(lignes).length} tables.`);

  const copie = process.env.SAUVEGARDE_COPIE;
  if (!copie) {
    console.warn("⚠ Aucune copie : renseigne SAUVEGARDE_COPIE, ou copie ces fichiers à la main sur un disque externe chiffré.");
  } else if (!existsSync(copie)) {
    console.warn(`⚠ Copie NON faite : ${copie} est introuvable (disque branché ?).`);
  } else {
    for (const f of fichiers) copyFileSync(join(dossier, f), join(copie, f));
    console.log(`Copie faite dans ${copie}.`);
  }
  console.log("À faire ensuite : npm run db:sauvegarde:verifier");
}

principal().catch((e) => {
  console.error(`Sauvegarde échouée : ${e.message}`);
  process.exit(1);
});
