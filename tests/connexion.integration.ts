import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 2 (corrigé les 03/11/2026) : limite des essais de connexion, sur la base LOCALE.
// Le temps est simulé par le paramètre `maintenant`.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

vi.mock("server-only", () => ({}));

const { prisma } = await import("@/lib/prisma");
const t = await import("@/lib/connexion/tentatives");

const id = randomUUID().slice(0, 8);
const email = `essais-${id}@cotiz.test`;
const ici = { email, reseau: `10.0.0.${id}` };
const ailleurs = { email, reseau: `10.9.9.${id}` };
const reseauPirate = `10.6.6.${id}`;
const minute = (n: number, depuis: Date) => new Date(depuis.getTime() + n * 60_000);

afterAll(async () => {
  const cles = [t.cleCompte(ici), t.cleCompte(ailleurs), t.cleReseau(ici.reseau), t.cleReseau(ailleurs.reseau), t.cleReseau(reseauPirate)];
  for (let i = 0; i < t.MAX_ECHECS_RESEAU; i++) cles.push(t.cleCompte({ email: `x${i}-${id}@cotiz.test`, reseau: reseauPirate }));
  await prisma.tentativeConnexion.deleteMany({ where: { cle: { in: [...cles, ...cles.map(t.cleBlocage)] } } });
  await prisma.$disconnect();
});

describe("limite des essais de connexion", () => {
  it(`le ${t.MAX_ECHECS}e échec bloque tout de suite, pour ${t.DUREE_BLOCAGE_MINUTES} minutes, quelle que soit la casse`, async () => {
    const debut = new Date();
    for (let i = 0; i < t.MAX_ECHECS - 1; i++) expect(await t.noterEchec(ici, minute(0, debut))).toBeNull();
    expect(await t.connexionBloquee(ici, minute(0, debut))).toBeNull();
    // 5e échec (adresse en majuscules) : c'est lui qui annonce le blocage.
    expect(await t.noterEchec({ ...ici, email: email.toUpperCase() }, minute(0, debut))).toBe(t.DUREE_BLOCAGE_MINUTES);
    expect(await t.connexionBloquee({ ...ici, email: ` ${email} ` }, minute(0, debut))).toBe(10);
    // Depuis un autre réseau, la même adresse n'est pas bloquée.
    expect(await t.connexionBloquee(ailleurs, minute(0, debut))).toBeNull();
  });

  it("le temps restant diminue, les essais pendant le blocage ne le prolongent pas, puis le compteur repart de zéro", async () => {
    const debut = (await prisma.tentativeConnexion.findFirstOrThrow({ where: { cle: t.cleBlocage(t.cleCompte(ici)) }, orderBy: { createdAt: "desc" } })).createdAt;
    expect(await t.connexionBloquee(ici, minute(1, debut))).toBe(9);
    expect(await t.connexionBloquee(ici, minute(7, debut))).toBe(3);
    expect(await t.connexionBloquee(ici, minute(9.5, debut))).toBe(1);
    expect(await t.connexionBloquee(ici, minute(10, debut))).toBeNull();
    // Après le blocage : un seul échec ne rebloque pas (les 5 d'avant ne comptent plus).
    expect(await t.noterEchec(ici, minute(11, debut))).toBeNull();
    expect(await t.connexionBloquee(ici, minute(11, debut))).toBeNull();
  });

  it("une connexion réussie efface le compteur de l'adresse", async () => {
    const debut = new Date();
    for (let i = 0; i < t.MAX_ECHECS; i++) await t.noterEchec(ailleurs, debut);
    expect(await t.connexionBloquee(ailleurs, debut)).toBe(10);
    await t.oublierEchecs(ailleurs);
    expect(await t.connexionBloquee(ailleurs, debut)).toBeNull();
  });

  it(`bloque un réseau après ${t.MAX_ECHECS_RESEAU} échecs, toutes adresses confondues`, async () => {
    const debut = new Date();
    for (let i = 0; i < t.MAX_ECHECS_RESEAU - 1; i++) await t.noterEchec({ email: `x${i}-${id}@cotiz.test`, reseau: reseauPirate }, debut);
    expect(await t.connexionBloquee({ email: `nouvelle-${id}@cotiz.test`, reseau: reseauPirate }, debut)).toBeNull();
    expect(await t.noterEchec({ email: `x${t.MAX_ECHECS_RESEAU - 1}-${id}@cotiz.test`, reseau: reseauPirate }, debut)).toBe(10);
    expect(await t.connexionBloquee({ email: `nouvelle-${id}@cotiz.test`, reseau: reseauPirate }, debut)).toBe(10);
  });

  it("ne stocke jamais l'adresse ni le réseau en clair", async () => {
    const lignes = await prisma.tentativeConnexion.findMany({ where: { cle: { in: [t.cleCompte(ici), t.cleReseau(ici.reseau), t.cleBlocage(t.cleCompte(ici))] } } });
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.every((l) => !l.cle.includes(email) && !l.cle.includes(ici.reseau) && /^[0-9a-f]{64}$/.test(l.cle))).toBe(true);
  });

  it("message : minutes au singulier et au pluriel ; réseau lu dans x-forwarded-for", () => {
    expect(t.messageBlocage(9)).toBe("Trop d'essais. Réessaie dans 9 minutes.");
    expect(t.messageBlocage(1)).toBe("Trop d'essais. Réessaie dans 1 minute.");
    expect(t.reseauDepuisEntetes(new Headers({ "x-forwarded-for": "41.82.1.2, 10.0.0.1" }))).toBe("41.82.1.2");
    expect(t.reseauDepuisEntetes(new Headers())).toBe("inconnu");
  });
});
