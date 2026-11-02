import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 ne lit plus .env tout seul. On utilise le chargeur natif de Node
// plutôt que la dépendance dotenv. Sur Vercel, il n'y a pas de fichier .env :
// les variables sont déjà dans l'environnement.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
  datasource: {
    // La CLI (migrations) passe par la connexion directe : le pooler Supabase
    // en mode transaction ne supporte pas les migrations.
    // L'application, elle, utilisera DATABASE_URL (pooler) via l'adaptateur pg (phase 1).
    url: process.env["DIRECT_URL"],
  },
});
