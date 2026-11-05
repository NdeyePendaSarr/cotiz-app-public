import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 2 (corrigé les 03/11/2026) : limite des essais de connexion, sur la base LOCALE.
// Le temps est simulé par le paramètre `maintenant`.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

const connexion = vi.hoisted(() => ({
  reponse: (async () => ({ error: null })) as () => Promise<{ error: { code?: string } | null }>,
  entetes: new Headers(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => connexion.entetes }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/supabase/serveur", () => ({
  creerClientSupabase: async () => ({ auth: { signInWithPassword: () => connexion.reponse() } }),
}));

const { prisma } = await import("@/lib/prisma");
const t = await import("@/lib/connexion/tentatives");
const { seConnecter } = await import("@/app/actions/auth");

/** Un mauvais mot de passe, comme dans seConnecter : essai réservé, puis échec confirmé. */
async function noterEchec(origine: { email: string; reseau: string }, maintenant?: Date) {
  const reservation = await t.reserverEssai(origine, maintenant);
  if ("bloque" in reservation) throw new Error("Essai refusé");
  return t.confirmerEchec(origine, maintenant);
}

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
    for (let i = 0; i < t.MAX_ECHECS - 1; i++) expect(await noterEchec(ici, minute(0, debut))).toBeNull();
    expect(await t.connexionBloquee(ici, minute(0, debut))).toBeNull();
    // 5e échec (adresse en majuscules) : c'est lui qui annonce le blocage.
    expect(await noterEchec({ ...ici, email: email.toUpperCase() }, minute(0, debut))).toBe(t.DUREE_BLOCAGE_MINUTES);
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
    expect(await noterEchec(ici, minute(11, debut))).toBeNull();
    expect(await t.connexionBloquee(ici, minute(11, debut))).toBeNull();
  });

  it("une connexion réussie efface le compteur de l'adresse", async () => {
    const debut = new Date();
    for (let i = 0; i < t.MAX_ECHECS; i++) await noterEchec(ailleurs, debut);
    expect(await t.connexionBloquee(ailleurs, debut)).toBe(10);
    await t.oublierEchecs(ailleurs);
    expect(await t.connexionBloquee(ailleurs, debut)).toBeNull();
  });

  it(`bloque un réseau après ${t.MAX_ECHECS_RESEAU} échecs, toutes adresses confondues`, async () => {
    const debut = new Date();
    for (let i = 0; i < t.MAX_ECHECS_RESEAU - 1; i++) await noterEchec({ email: `x${i}-${id}@cotiz.test`, reseau: reseauPirate }, debut);
    expect(await t.connexionBloquee({ email: `nouvelle-${id}@cotiz.test`, reseau: reseauPirate }, debut)).toBeNull();
    expect(await noterEchec({ email: `x${t.MAX_ECHECS_RESEAU - 1}-${id}@cotiz.test`, reseau: reseauPirate }, debut)).toBe(10);
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

  it("IPv6 : tout un bloc /64 compte comme un seul réseau, quelle que soit l'écriture", () => {
    const reseau = "2001:db8:1:2::/64";
    for (const ip of ["2001:db8:1:2::1", "2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd", "2001:DB8:1:2:0:0:0:ffff", "2001:db8:1:2::1%eth0"]) expect(t.reseauDeLAdresse(ip)).toBe(reseau);
    expect(t.reseauDeLAdresse("2001:db8:1:3::1")).not.toBe(reseau);
    expect(t.reseauDeLAdresse("::ffff:41.82.1.2")).toBe("41.82.1.2");
    expect(t.reseauDeLAdresse("::1")).toBe("0:0:0:0::/64");
    expect(t.reseauDeLAdresse("41.82.1.2")).toBe("41.82.1.2");
    expect(t.reseauDepuisEntetes(new Headers({ "x-forwarded-for": "2001:db8:1:2::1, 10.0.0.1" }))).toBe(reseau);
  });
});

describe("réservation des essais", () => {
  const nettoyer = async (origine: { email: string; reseau: string }) => {
    const cles = [t.cleCompte(origine), t.cleReseau(origine.reseau)];
    await prisma.tentativeConnexion.deleteMany({ where: { cle: { in: [...cles, ...cles.map(t.cleBlocage)] } } });
  };

  it(`${t.MAX_ECHECS * 4} essais simultanés : ${t.MAX_ECHECS} passent, les autres sont refusés`, async () => {
    const origine = { email: `simultane-${id}@cotiz.test`, reseau: `10.1.1.${id}` };
    const resultats = await Promise.all(Array.from({ length: t.MAX_ECHECS * 4 }, () => t.reserverEssai(origine)));
    expect(resultats.filter((r) => "essai" in r)).toHaveLength(t.MAX_ECHECS);
    expect(resultats.filter((r) => "bloque" in r).every((r) => "bloque" in r && r.bloque === 1)).toBe(true);
    await nettoyer(origine);
  });

  it("un essai annulé ne compte plus dans aucun des deux compteurs", async () => {
    const origine = { email: `annule-${id}@cotiz.test`, reseau: `10.2.2.${id}` };
    for (let i = 0; i < t.MAX_ECHECS * 2; i++) {
      const r = await t.reserverEssai(origine);
      if (!("essai" in r)) throw new Error("Essai refusé");
      await t.annulerEssai(r.essai);
    }
    expect(await prisma.tentativeConnexion.count({ where: { cle: { in: [t.cleCompte(origine), t.cleReseau(origine.reseau)] } } })).toBe(0);
  });
});

describe("seConnecter", () => {
  const reseau = `10.3.3.${id}`;
  const adresse = `action-${id}@cotiz.test`;
  const origine = { email: adresse, reseau };
  const envoyer = () => {
    const fd = new FormData();
    fd.append("email", adresse);
    fd.append("motDePasse", "un-mot-de-passe");
    return seConnecter(undefined, fd);
  };
  const compter = () => prisma.tentativeConnexion.count({ where: { cle: { in: [t.cleCompte(origine), t.cleReseau(reseau)] } } });

  afterAll(async () => {
    const cles = [t.cleCompte(origine), t.cleReseau(reseau)];
    await prisma.tentativeConnexion.deleteMany({ where: { cle: { in: [...cles, ...cles.map(t.cleBlocage)] } } });
  });

  it.each([
    ["limite de Supabase", async () => ({ error: { code: "over_request_rate_limit" } })],
    ["erreur sans code", async () => ({ error: {} })],
    ["panne réseau", async () => { throw new Error("réseau coupé"); }],
  ])("%s : message distinct, rien n'est compté", async (_cas, reponse) => {
    connexion.entetes = new Headers({ "x-forwarded-for": reseau });
    connexion.reponse = reponse;
    for (let i = 0; i < t.MAX_ECHECS + 1; i++) expect((await envoyer())?.erreur).toBe("Connexion impossible pour le moment. Réessaie dans un instant.");
    expect(await compter()).toBe(0);
  });

  it("mauvais mot de passe : compté, et le 5e bloque ; une réussite efface le compteur de l'adresse", async () => {
    connexion.reponse = async () => ({ error: { code: "invalid_credentials" } });
    for (let i = 0; i < t.MAX_ECHECS - 1; i++) expect((await envoyer())?.erreur).toBe("E-mail ou mot de passe incorrect.");
    expect((await envoyer())?.erreur).toBe(t.messageBlocage(t.DUREE_BLOCAGE_MINUTES));
    expect((await envoyer())?.erreur).toBe(t.messageBlocage(t.DUREE_BLOCAGE_MINUTES));
    await prisma.tentativeConnexion.deleteMany({ where: { cle: t.cleBlocage(t.cleCompte(origine)) } });
    await prisma.tentativeConnexion.deleteMany({ where: { cle: t.cleCompte(origine) } });

    connexion.reponse = async () => ({ error: null });
    await expect(envoyer()).rejects.toThrow("REDIRECT /tableau-de-bord");
    expect(await prisma.tentativeConnexion.count({ where: { cle: t.cleCompte(origine) } })).toBe(0);
  });
});
