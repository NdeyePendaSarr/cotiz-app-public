import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 2 : limite des essais de connexion, sur la base LOCALE.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { cleConnexion, connexionBloquee, MAX_ECHECS, noterEchec, oublierEchecs } = await import("@/lib/connexion/tentatives");

const email = `essais-${randomUUID().slice(0, 8)}@cotiz.test`;

afterAll(async () => {
  await prisma.tentativeConnexion.deleteMany({ where: { cle: cleConnexion(email) } });
  await prisma.$disconnect();
});

describe("limite des essais de connexion", () => {
  it(`bloque après ${MAX_ECHECS} échecs, quelle que soit la casse ; une réussite remet à zéro`, async () => {
    for (let i = 0; i < MAX_ECHECS - 1; i++) await noterEchec(email);
    expect(await connexionBloquee(email)).toBe(false);
    await noterEchec(email.toUpperCase());
    expect(await connexionBloquee(` ${email} `)).toBe(true);

    await oublierEchecs(email);
    expect(await connexionBloquee(email)).toBe(false);
  });

  it("ne stocke jamais l'adresse en clair", async () => {
    await noterEchec(email);
    const lignes = await prisma.tentativeConnexion.findMany({ where: { cle: cleConnexion(email) } });
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.every((l) => l.cle !== email && /^[0-9a-f]{64}$/.test(l.cle))).toBe(true);
  });
});
