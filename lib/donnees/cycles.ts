import "server-only";
import { prisma } from "@/lib/prisma";

/** Cycle ouvert d'une caisse (filtré par ownerId), avec le nombre d'échéances et le total attendu. */
export async function obtenirCycleOuvert(ownerId: string, caisseId: string) {
  const cycle = await prisma.cycle.findFirst({ where: { caisseId, statut: "OUVERT", caisse: { ownerId } } });
  if (!cycle) return null;
  const { _count, _sum } = await prisma.echeance.aggregate({
    where: { cycleId: cycle.id },
    _count: true,
    _sum: { montantDu: true },
  });
  return { ...cycle, nbEcheances: _count, totalAttendu: _sum.montantDu ?? 0 };
}

export function compterCycles(ownerId: string, caisseId: string) {
  return prisma.cycle.count({ where: { caisseId, caisse: { ownerId } } });
}
