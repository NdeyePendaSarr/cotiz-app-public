// Prouve qu'une sauvegarde est utilisable : npm run db:sauvegarde:verifier (lit .env, base LOCALE).
// Restaure la dernière sauvegarde (ou celle du dossier donné en argument) dans une base temporaire de
// Supabase local, compare le nombre de lignes au manifeste, contrôle le fichier des comptes, puis
// supprime la base temporaire. Aucun contenu n'est affiché, et rien ne touche à la production.

import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compterLignes, dansPostgres, dossierSauvegardes, urlPourConteneur } from "./sauvegarde-commun.mjs";

async function principal() {
  const locale = process.env.DIRECT_URL ?? "";
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(locale)) throw new Error("La vérification se fait uniquement sur la base locale : lance plutôt npm run db:sauvegarde:verifier.");

  const dossier = resolve(process.argv[2] ?? dossierSauvegardes());
  const manifestes = readdirSync(dossier).filter((f) => f.endsWith("-manifeste.json")).sort();
  if (manifestes.length === 0) throw new Error(`Aucune sauvegarde dans ${dossier}.`);
  const manifeste = JSON.parse(readFileSync(join(dossier, manifestes.at(-1)), "utf8"));
  console.log(`Vérification de la sauvegarde du ${manifeste.date}…`);

  const admin = urlPourConteneur(locale);
  const base = `cotiz_verif_${randomBytes(4).toString("hex")}`;
  const temporaire = admin.replace(/\/[^/?]+(\?|$)/, `/${base}$1`);
  await dansPostgres(`psql "$BASE" -X -q -v ON_ERROR_STOP=1 -c 'CREATE DATABASE ${base}'`, { url: admin });
  try {
    // Le schéma public existe déjà dans une base neuve : --clean le recrée, à l'identique de la sauvegarde.
    await dansPostgres(`pg_restore --dbname="$BASE" --no-owner --no-privileges --clean --if-exists --exit-on-error "/sauvegarde/${manifeste.public}"`, { url: temporaire, montage: dossier });
    const restaurees = await compterLignes(temporaire);

    const tables = new Set([...Object.keys(manifeste.lignes), ...Object.keys(restaurees)]);
    const ecarts = [...tables].filter((t) => manifeste.lignes[t] !== restaurees[t]);
    for (const t of ecarts) console.error(`Écart sur ${t} : ${manifeste.lignes[t] ?? "absente"} attendues, ${restaurees[t] ?? "absente"} restaurées.`);
    if (ecarts.length > 0) throw new Error("La restauration ne correspond pas au manifeste. Si la base a été modifiée pendant la sauvegarde, relance-la.");

    const sommaire = await dansPostgres(`pg_restore --list "/sauvegarde/${manifeste.comptes}"`, { url: admin, montage: dossier });
    for (const table of ["users", "identities"]) {
      if (!new RegExp(`TABLE DATA auth ${table}\\b`).test(sommaire)) throw new Error(`Le fichier des comptes ne contient pas auth.${table}.`);
    }
    const total = Object.values(restaurees).reduce((s, n) => s + n, 0);
    console.log(`Sauvegarde utilisable : ${tables.size} tables, ${total} lignes restaurées à l'identique ; comptes présents.`);
  } finally {
    await dansPostgres(`psql "$BASE" -X -q -c 'DROP DATABASE IF EXISTS ${base} WITH (FORCE)'`, { url: admin });
  }
}

principal().catch((e) => {
  console.error(`Vérification échouée : ${e.message}`);
  process.exit(1);
});
