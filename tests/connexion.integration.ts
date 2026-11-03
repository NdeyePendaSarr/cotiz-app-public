import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 2 (corrigé le 03/11/2026) : limite des essais de connexion, sur la base LOCALE.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const { cleCompte, cleReseau, connexionBloquee, MAX_ECHECS, MAX_ECHECS_RESEAU, noterEchec, oublierEchecs, reseauDepuisEntetes } = await import(
  "@/lib/connexion/tentatives"
);

const id = randomUUID().slice(0, 8);
const email = `essais-${id}@cotiz.test`;
const ici = { email, reseau: `10.0.0.${id}` };
const ailleurs = { email, reseau: `10.9.9.${id}` };
const reseauPirate = `10.6.6.${id}`;

afterAll(async () => {
  await prisma.tentativeConnexion.deleteMany({
    where: { cle: { in: [cleCompte(ici), cleCompte(ailleurs), cleReseau(ici.reseau), cleReseau(ailleurs.reseau), cleReseau(reseauPirate)] } },
  });
  // Comptes « pirate » : une clé par adresse essayée.
  for (let i = 0; i < MAX_ECHECS_RESEAU; i++) await prisma.tentativeConnexion.deleteMany({ where: { cle: cleCompte({ email: `x${i}-${id}@cotiz.test`, reseau: reseauPirate }) } });
  await prisma.$disconnect();
});

describe("limite des essais de connexion", () => {
  it(`bloque après ${MAX_ECHECS} échecs d'une adresse depuis un réseau, quelle que soit la casse ; une réussite remet à zéro`, async () => {
    for (let i = 0; i < MAX_ECHECS - 1; i++) await noterEchec(ici);
    expect(await connexionBloquee(ici)).toBe(false);
    await noterEchec({ ...ici, email: email.toUpperCase() });
    expect(await connexionBloquee({ ...ici, email: ` ${email} ` })).toBe(true);

    // Depuis un autre réseau, la même adresse n'est pas bloquée : personne ne peut bloquer la trésorière à distance.
    expect(await connexionBloquee(ailleurs)).toBe(false);

    await oublierEchecs(ici);
    expect(await connexionBloquee(ici)).toBe(false);
  });

  it(`bloque un réseau après ${MAX_ECHECS_RESEAU} échecs, toutes adresses confondues`, async () => {
    for (let i = 0; i < MAX_ECHECS_RESEAU - 1; i++) await noterEchec({ email: `x${i}-${id}@cotiz.test`, reseau: reseauPirate });
    expect(await connexionBloquee({ email: `nouvelle-${id}@cotiz.test`, reseau: reseauPirate })).toBe(false);
    await noterEchec({ email: `x${MAX_ECHECS_RESEAU - 1}-${id}@cotiz.test`, reseau: reseauPirate });
    expect(await connexionBloquee({ email: `nouvelle-${id}@cotiz.test`, reseau: reseauPirate })).toBe(true);
  });

  it("ne stocke jamais l'adresse ni le réseau en clair", async () => {
    await noterEchec(ici);
    const lignes = await prisma.tentativeConnexion.findMany({ where: { cle: { in: [cleCompte(ici), cleReseau(ici.reseau)] } } });
    expect(lignes.length).toBeGreaterThanOrEqual(2); // + les échecs du réseau notés au test précédent
    expect(lignes.every((l) => !l.cle.includes(email) && !l.cle.includes(ici.reseau) && /^[0-9a-f]{64}$/.test(l.cle))).toBe(true);
  });

  it("lit le réseau dans x-forwarded-for (Vercel), sinon « inconnu »", () => {
    expect(reseauDepuisEntetes(new Headers({ "x-forwarded-for": "41.82.1.2, 10.0.0.1" }))).toBe("41.82.1.2");
    expect(reseauDepuisEntetes(new Headers())).toBe("inconnu");
  });
});
