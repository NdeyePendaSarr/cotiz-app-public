import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Client Prisma unique pour toute l'application.
// En développement, le rechargement à chaud de Next réévalue les modules : sans ce
// cache sur globalThis, chaque modification ouvrirait un nouveau pool de connexions
// jusqu'à saturer Postgres.

function creerClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example)");

  // Prisma 7 passe par un adaptateur : ici le pilote node-postgres (pg),
  // connecté au pooler Supabase (mode transaction, port 6543, en production).
  // max : sur Vercel, chaque instance garde son propre pool. 10 = les ~10 lectures d'une page
  // (layout + page) partent ensemble. Possible seulement avec le pooler en mode TRANSACTION :
  // incident du 31/10/2026, pool de 10 + mode session (15 clients au total) → EMAXCONNSESSION.
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 }),
  });
}

const globalPourPrisma = globalThis as unknown as { prisma?: ReturnType<typeof creerClient> };

export const prisma = globalPourPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") globalPourPrisma.prisma = prisma;
