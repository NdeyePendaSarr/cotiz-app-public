import "server-only";
import { prisma } from "@/lib/prisma";

export function compterCycles(ownerId: string, caisseId: string) {
  return prisma.cycle.count({ where: { caisseId, caisse: { ownerId } } });
}
