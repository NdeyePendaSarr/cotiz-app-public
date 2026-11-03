import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Mensualité (500 FCFA × 12 mois), sur la base LOCALE : création (un cycle pour toute la durée),
// membre inscrit en cours d'année (doit toute la durée), versement en retard puis d'avance,
// dépense, durée corrigée, et isolation entre deux trésorières. Seule la session est simulée.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test des mensualités refusé : ${refus}`);

const session = vi.hoisted(() => ({ courante: null as null | { id: string; email: string; nom: string } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({
  exigerUtilisatrice: vi.fn(async () => {
    if (!session.courante) throw new Error("Pas de session simulée");
    return session.courante;
  }),
}));

const { prisma } = await import("@/lib/prisma");
const caisses = await import("@/app/actions/caisses");
const membres = await import("@/app/actions/membres");
const rapprochement = await import("@/app/actions/rapprochement");
const depenses = await import("@/app/actions/depenses");
const { situationMensualite } = await import("@/lib/mensualite");

const aujourdhui = new Date(new Date().toISOString().slice(0, 10));
// Premier mois : il y a deux mois (deux mois terminés, le troisième en cours).
const debut = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - 2, 1));
const moisDebut = debut.toISOString().slice(0, 7);

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

async function creerUtilisatrice(nom: string) {
  const id = randomUUID();
  const u = { id, email: `mensualite-${nom}-${id.slice(0, 8)}@cotiz.test`, nom: `Mensualité ${nom}` };
  await prisma.utilisatrice.create({ data: u });
  return u;
}

let a: Awaited<ReturnType<typeof creerUtilisatrice>>;
let b: Awaited<ReturnType<typeof creerUtilisatrice>>;
let caisseId: string;

beforeAll(async () => {
  a = await creerUtilisatrice("A");
  b = await creerUtilisatrice("B");
  session.courante = a;
});

afterAll(async () => {
  await prisma.utilisatrice.deleteMany({ where: { id: { in: [a?.id, b?.id].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("mensualité", () => {
  it("création : un seul cycle, du 1er du premier mois au dernier jour du 12e", async () => {
    const champs = { type: "MENSUALITE", nom: "Mensualité cellule", montantCotisation: "500", nombreMois: "12", moisDebut };
    await expect(caisses.creerCaisse(undefined, formulaire(champs))).rejects.toThrow(/^REDIRECT \/caisses\//);
    const caisse = await prisma.caisse.findFirstOrThrow({ where: { ownerId: a.id, nom: "Mensualité cellule" }, include: { cycles: true } });
    caisseId = caisse.id;
    expect(caisse).toMatchObject({ type: "MENSUALITE", montantCotisation: 500, nombreMois: 12, frequence: null });
    expect(caisse.moisDebut?.toISOString().slice(0, 10)).toBe(debut.toISOString().slice(0, 10));
    expect(caisse.cycles).toHaveLength(1);
    expect(caisse.cycles[0].dateDebut.toISOString().slice(0, 10)).toBe(debut.toISOString().slice(0, 10));
    expect(caisse.cycles[0].dateEcheance.toISOString()).toBe(caisse.dateLimite?.toISOString());
  });

  it("membre inscrit au 3e mois : il doit toute la durée (6 000), sans ordre de passage", async () => {
    const personne = await prisma.personne.create({ data: { ownerId: a.id, nomComplet: "Moussa Fall" } });
    await expect(membres.ajouterMembre(formulaire({ caisseId, personneId: personne.id }))).rejects.toThrow(/^REDIRECT/);
    const membre = await prisma.membreCaisse.findFirstOrThrow({ where: { caisseId, personneId: personne.id }, include: { echeances: true } });
    expect(membre.ordrePassage).toBeNull();
    expect(membre.echeances.map((e) => e.montantDu)).toEqual([6_000]);
  });

  it("2 000 versés au 3e mois : les deux mois en retard, le mois en cours et un mois d'avance", async () => {
    const echeance = await prisma.echeance.findFirstOrThrow({ where: { cycle: { caisseId } } });
    const membre = await prisma.membreCaisse.findUniqueOrThrow({ where: { id: echeance.membreCaisseId } });
    const paiement = await prisma.paiement.create({
      data: { ownerId: a.id, canal: "WAVE", source: "SAISIE_MANUELLE", montant: 2_000, dateReception: new Date() },
    });
    const etat = await rapprochement.validerRapprochement(paiement.id, undefined, formulaire({ personneId: membre.personneId, [`ligne-${echeance.id}`]: "2000" }));
    expect(etat).toBeUndefined();
    const paye = (await prisma.allocation.aggregate({ where: { echeanceId: echeance.id }, _sum: { montant: true } }))._sum.montant ?? 0;
    const s = situationMensualite(paye, 500, debut, 12, aujourdhui);
    expect(s.mois.slice(0, 5).map((m) => m.etat)).toEqual(["PAYE", "PAYE", "PAYE", "PAYE", "A_VENIR"]);
    expect(s).toMatchObject({ retard: 0, avance: 500 });
  });

  it("dépense acceptée sur une mensualité ; refusée sur celle d'une autre trésorière", async () => {
    const champs = { date: aujourdhui.toISOString().slice(0, 10), montant: "1 000", motif: "Crédit de la cellule", beneficiaire: "", canal: "WAVE", categorie: "COMMUNICATION" };
    await expect(depenses.creerDepense(caisseId, undefined, formulaire(champs))).rejects.toThrow(`REDIRECT /caisses/${caisseId}`);
    session.courante = b;
    try {
      expect(await depenses.creerDepense(caisseId, undefined, formulaire(champs))).toHaveProperty("erreur");
      // B ne peut pas non plus modifier la durée de la mensualité de A.
      const modif = { type: "MENSUALITE", nom: "Piratage", montantCotisation: "1", nombreMois: "1", moisDebut };
      expect(await caisses.modifierCaisse(caisseId, undefined, formulaire(modif))).toMatchObject({ erreur: "Caisse introuvable." });
    } finally {
      session.courante = a;
    }
    expect(await prisma.depense.count({ where: { caisseId } })).toBe(1);
  });

  it("durée corrigée à 10 mois : dû de chaque membre et fin du cycle recalculés, versements gardés", async () => {
    const modif = { type: "MENSUALITE", nom: "Mensualité cellule", montantCotisation: "500", nombreMois: "10", moisDebut };
    await expect(caisses.modifierCaisse(caisseId, undefined, formulaire(modif))).rejects.toThrow(/^REDIRECT/);
    const caisse = await prisma.caisse.findUniqueOrThrow({ where: { id: caisseId }, include: { cycles: { include: { echeances: { include: { allocations: true } } } } } });
    expect(caisse.nombreMois).toBe(10);
    expect(caisse.cycles[0].dateEcheance.toISOString()).toBe(caisse.dateLimite?.toISOString());
    expect(caisse.cycles[0].echeances.map((e) => [e.montantDu, e.allocations.reduce((s, x) => s + x.montant, 0)])).toEqual([[5_000, 2_000]]);
  });
});
