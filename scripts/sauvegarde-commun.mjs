// Outils partagés par les scripts de sauvegarde : pg_dump, pg_restore et psql passent par l'image
// Docker de Postgres (rien à installer sur le poste). L'URL de la base est transmise au conteneur
// par une variable d'environnement, jamais sur la ligne de commande, et n'est jamais affichée.

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Postgres 17, comme supabase/config.toml. pg_dump accepte un serveur de version égale ou inférieure.
const IMAGE = process.env.SAUVEGARDE_IMAGE_PG || "postgres:17-alpine";

export const dossierSauvegardes = () => process.env.SAUVEGARDE_DOSSIER || join(homedir(), "cotiz-sauvegardes");

const masquer = (texte) => texte.replace(/postgres(?:ql)?:\/\/\S+/g, "[url masquée]");

/** Depuis un conteneur, la base locale du poste s'appelle host.docker.internal. */
export const urlPourConteneur = (url) => url.replace(/@(127\.0\.0\.1|localhost)([:/])/, "@host.docker.internal$2");

/**
 * Lance `commande` dans un conteneur, avec l'URL dans $BASE. Si `fichier` est donné, la sortie y est
 * écrite ; sinon elle est renvoyée. `montage` : dossier du poste, visible en lecture dans /sauvegarde.
 */
export function dansPostgres(commande, { url, fichier, montage } = {}) {
  const args = ["run", "--rm", "-i", "-e", "BASE", ...(montage ? ["-v", `${montage}:/sauvegarde:ro`] : []), IMAGE, "sh", "-c", commande];
  return new Promise((resolve, reject) => {
    const processus = spawn("docker", args, { env: { ...process.env, BASE: url }, stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "";
    let erreurs = "";
    const destination = fichier ? createWriteStream(fichier) : null;
    if (destination) processus.stdout.pipe(destination);
    else processus.stdout.on("data", (morceau) => (sortie += morceau));
    processus.stderr.on("data", (morceau) => (erreurs += morceau));
    processus.on("error", () => reject(new Error("Docker est introuvable : lance Docker Desktop.")));
    processus.on("close", (code) => {
      const fin = () => (code === 0 ? resolve(sortie) : reject(new Error(masquer(erreurs.trim()) || `Échec (code ${code}).`)));
      if (destination) destination.close(fin);
      else fin();
    });
  });
}

/** Nombre de lignes de chaque table du schéma public, et des comptes. */
export const SQL_COMPTAGE = `
  SELECT json_object_agg(t.nom, t.n) FROM (
    SELECT c.relname AS nom,
           (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS n
    FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind = 'r'
  ) t`;

export const compterLignes = async (url) => JSON.parse(await dansPostgres(`psql "$BASE" -X -A -t -v ON_ERROR_STOP=1 -c "${SQL_COMPTAGE.replace(/\s+/g, " ")}"`, { url }));
