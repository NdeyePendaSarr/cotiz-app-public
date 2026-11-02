import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Phase 10, de bout en bout sur la base LOCALE : import d'une liste avec les colonnes Cellule et
// Versé dans une collecte (le versé au-delà de la cotisation devient une bonne volonté). Seule la session est simulée ; Zod, Prisma et la base tournent pour de vrai.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

const session = vi.hoisted(() => ({ courante: null as null | { id: string; email: string; nom: string } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ exigerUtilisatrice: vi.fn(async () => session.courante) }));

const { prisma } = await import("@/lib/prisma");
const { traiterImport } = await import("@/app/actions/import");
const { garderCommeDon, supprimerDon } = await import("@/app/actions/dons");
const { compterARembourser, excedentsARembourser } = await import("@/lib/donnees/suivi");
const { formaterFCFA } = await import("@/lib/format");

const LISTE = [
  "N°\tPrénom\tNom\tCellule\tTéléphone\tMontant\tVersé",
  "1\tKhady\tDiop\tOrganisation\t77 123 45 67\t2 000\t2 000",
  "2\tMoussa\tKa\tTechnique\t781112233\t2 000\t",
  "3\tAïda\tSow\tTechnique\t\t2 000\t500",
  "4\tFatou\tKane\tOrganisation\t761230002\t2 000\t3 000",
].join("\n");

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

const ownerId = randomUUID();
let caisseId = "";
let cycleId = "";

beforeAll(async () => {
  session.courante = { id: ownerId, email: `reprise-${ownerId.slice(0, 8)}@cotiz.test`, nom: "Reprise" };
  await prisma.utilisatrice.create({ data: session.courante });
  // Personne déjà connue (sans cellule) : sa cellule doit être complétée, pas dupliquée.
  await prisma.personne.create({ data: { ownerId, nomComplet: "Cheikh Ndour", numeros: { create: { ownerId, numero: "781112233" } } } });
  const caisse = await prisma.caisse.create({
    data: { ownerId, nom: "Séminaire", type: "COLLECTE", montantCotisation: 2_000, dateLimite: new Date("2030-01-15") },
  });
  caisseId = caisse.id;
  cycleId = (await prisma.cycle.create({ data: { caisseId, numero: 1, dateDebut: new Date("2030-01-01"), dateEcheance: new Date("2030-01-15") } })).id;
});

afterAll(async () => {
  await prisma.utilisatrice.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe("import avec Cellule et Versé (phase 10)", () => {
  it("l'aperçu lit cellules et versés sans rien écrire", async () => {
    const etat = await traiterImport(caisseId, undefined, formulaire({ texte: LISTE, intention: "analyser" }));
    expect(etat?.apercu?.resume).toMatchObject({ aImporter: 4, verses: 3, totalVerse: 5_500, bonnesVolontes: 1_000 });
    expect(etat?.apercu?.lignes.find((l) => l.nom === "Fatou Kane")?.messages).toContain(`Dont ${formaterFCFA(1_000)} en bonne volonté.`);
    expect(await prisma.paiement.count({ where: { ownerId } })).toBe(0);
  });

  it("refuse d'importer des versés sans canal", async () => {
    const etat = await traiterImport(caisseId, undefined, formulaire({ texte: LISTE, intention: "importer" }));
    expect(etat?.erreur).toBe("Choisis le canal des paiements déjà versés.");
    expect(await prisma.membreCaisse.count({ where: { caisseId } })).toBe(0);
  });

  it("importe membres, cellules et paiements rapprochés, avec le journal", async () => {
    const etat = await traiterImport(caisseId, undefined, formulaire({ texte: LISTE, intention: "importer", canal: "WAVE" }));
    expect(etat?.termine).toMatchObject({ importes: 4, verses: 3, totalVerse: 5_500, bonnesVolontes: 1_000 });

    const personnes = await prisma.personne.findMany({ where: { ownerId }, orderBy: { nomComplet: "asc" }, select: { nomComplet: true, cellule: true } });
    expect(personnes).toEqual([
      { nomComplet: "Aïda Sow", cellule: "Technique" },
      { nomComplet: "Cheikh Ndour", cellule: "Technique" }, // personne existante : cellule complétée, pas de doublon
      { nomComplet: "Fatou Kane", cellule: "Organisation" },
      { nomComplet: "Khady Diop", cellule: "Organisation" },
    ]);

    const paiements = await prisma.paiement.findMany({
      where: { ownerId },
      orderBy: { montant: "asc" },
      select: { id: true, montant: true, canal: true, statut: true, origine: true, datation: true, personne: { select: { nomComplet: true } }, allocations: { select: { montant: true, echeance: { select: { cycleId: true } } } } },
    });
    expect(paiements.map((p) => [p.personne?.nomComplet, p.montant, p.canal, p.statut, p.allocations.map((a) => a.montant)])).toEqual([
      ["Aïda Sow", 500, "WAVE", "RAPPROCHE", [500]],
      ["Khady Diop", 2_000, "WAVE", "RAPPROCHE", [2_000]],
      ["Fatou Kane", 3_000, "WAVE", "RAPPROCHE", [2_000]], // 1 000 au-delà de la cotisation : bonne volonté
    ]);
    // Collecte : le surplus de Fatou devient une bonne volonté liée à son paiement, rien à rembourser.
    const dons = await prisma.don.findMany({ where: { ownerId }, select: { caisseId: true, montant: true, donateur: true, canal: true, paiementId: true } });
    expect(dons).toEqual([{ caisseId, montant: 1_000, donateur: "Fatou Kane", canal: "WAVE", paiementId: paiements[2].id }]);
    expect(await excedentsARembourser(ownerId)).toEqual([]);
    expect(await compterARembourser(ownerId)).toBe(0);
    expect(paiements.every((p) => p.origine === "REPRISE_IMPORT" && p.datation === "NON_DATEE" && p.allocations.every((a) => a.echeance.cycleId === cycleId))).toBe(true);

    // Journal : création + rapprochement par paiement, et une ligne par allocation.
    const journal = await prisma.journalAudit.findMany({ where: { ownerId }, select: { entite: true, action: true } });
    expect(journal.filter((j) => j.entite === "Paiement" && j.action === "CREATION")).toHaveLength(3);
    expect(journal.filter((j) => j.entite === "Paiement" && j.action === "MODIFICATION")).toHaveLength(3);
    expect(journal.filter((j) => j.entite === "Allocation")).toHaveLength(3);
    expect(journal.filter((j) => j.entite === "Don" && j.action === "CREATION")).toHaveLength(1);
  });

  it("bonne volonté supprimée → à rembourser ; « Garder comme bonne volonté » la recrée", async () => {
    const don = await prisma.don.findFirstOrThrow({ where: { ownerId }, select: { id: true, paiementId: true } });
    await expect(supprimerDon(formulaire({ donId: don.id }))).resolves.toBeUndefined();
    const aRembourser = await excedentsARembourser(ownerId);
    expect(aRembourser.map((p) => [p.id, p.excedent, p.collecte?.id])).toEqual([[don.paiementId, 1_000, caisseId]]);
    expect(await compterARembourser(ownerId)).toBe(1); // même règle que la liste, calculée par la base

    await garderCommeDon(formulaire({ paiementId: don.paiementId! }));
    expect(await excedentsARembourser(ownerId)).toEqual([]);
    expect(await prisma.don.findMany({ where: { ownerId }, select: { montant: true, donateur: true, paiementId: true } })).toEqual([
      { montant: 1_000, donateur: "Fatou Kane", paiementId: don.paiementId },
    ]);
    // Deuxième clic : rien de plus (un seul don par paiement).
    await garderCommeDon(formulaire({ paiementId: don.paiementId! }));
    expect(await prisma.don.count({ where: { ownerId } })).toBe(1);
  });

  it("réimport : complète les nouveaux versés sans jamais compter deux fois", async () => {
    // Moussa a maintenant versé ; Aïda reçoit son numéro (elle n'en avait pas).
    const miseAJour = LISTE.replace("781112233\t2 000\t", "781112233\t2 000\t2 000").replace("Technique\t\t2 000\t500", "Technique\t70 999 88 77\t2 000\t500");
    // Aïda est retrouvée par son nom sans rien choisir : seule personne de ce nom, déjà membre de la caisse.
    const apercu = await traiterImport(caisseId, undefined, formulaire({ texte: miseAJour, intention: "analyser" }));
    const aida = apercu?.apercu?.lignes.find((l) => l.nom === "Aïda Sow");
    expect(aida).toMatchObject({ statut: "deja_membre", numeroAAjouter: true });
    expect(apercu?.apercu?.resume.aChoisir).toBe(0);
    const etat = await traiterImport(caisseId, undefined, formulaire({ texte: miseAJour, intention: "importer", canal: "CASH" }));
    expect(etat?.erreur).toBeUndefined();
    expect(etat?.termine).toMatchObject({ importes: 0, verses: 1, totalVerse: 2_000 });
    const numerosAida = await prisma.numeroPersonne.findMany({ where: { ownerId, personne: { nomComplet: "Aïda Sow" } }, select: { numero: true } });
    expect(numerosAida).toEqual([{ numero: "709998877" }]);

    const parPersonne = await prisma.paiement.groupBy({ by: ["personneId"], where: { ownerId }, _count: true });
    expect(parPersonne.every((g) => g._count === 1)).toBe(true);
    expect(await prisma.paiement.count({ where: { ownerId } })).toBe(4);
    expect(await prisma.membreCaisse.count({ where: { caisseId } })).toBe(4);
  });

  it("réimport avec une colonne Canal ajoutée : corrige le canal des versés déjà repris, rien d'autre", async () => {
    // Même liste, avec la colonne Canal : Khady et Fatou ont payé autrement que le Wave choisi au premier import.
    const canaux = ["Canal", "OM", "Cash", "", "Cash"];
    const lignes = LISTE.replace("781112233\t2 000\t", "781112233\t2 000\t2 000").replace("Technique\t\t2 000\t500", "Technique\t70 999 88 77\t2 000\t500").split("\n");
    const avecCanal = lignes.map((l, i) => `${l}\t${canaux[i]}`).join("\n");
    const fatou = await prisma.paiement.findFirstOrThrow({ where: { ownerId, personne: { nomComplet: "Fatou Kane" } }, select: { id: true, montant: true } });
    const avant = await prisma.paiement.count({ where: { ownerId } });

    const apercu = await traiterImport(caisseId, undefined, formulaire({ texte: avecCanal, intention: "analyser" }));
    expect(apercu?.apercu?.resume.canauxCorriges).toBe(2); // Khady (Wave → OM), Fatou (Wave → cash) ; Moussa déjà en cash
    const etat = await traiterImport(caisseId, undefined, formulaire({ texte: avecCanal, intention: "importer" }));
    expect(etat?.erreur).toBeUndefined();
    expect(etat?.termine).toMatchObject({ importes: 0, verses: 0, canauxCorriges: 2 });

    const parNom = await prisma.paiement.findMany({ where: { ownerId }, select: { canal: true, montant: true, personne: { select: { nomComplet: true } } } });
    expect(Object.fromEntries(parNom.map((p) => [p.personne?.nomComplet, p.canal]))).toMatchObject({ "Khady Diop": "ORANGE_MONEY", "Fatou Kane": "CASH", "Cheikh Ndour": "CASH" });
    expect(await prisma.paiement.count({ where: { ownerId } })).toBe(avant); // aucun paiement en plus
    expect(parNom.find((p) => p.personne?.nomComplet === "Fatou Kane")?.montant).toBe(fatou.montant); // montant inchangé
    // La bonne volonté issue du paiement de Fatou suit, et chaque correction est au journal.
    expect((await prisma.don.findFirst({ where: { ownerId, paiementId: fatou.id } }))?.canal).toBe("CASH");
    expect(await prisma.journalAudit.count({ where: { ownerId, entite: "Paiement", entiteId: fatou.id, details: { path: ["source"], equals: "REIMPORT" } } })).toBe(1);

    // Un second réimport identique ne change plus rien.
    const encore = await traiterImport(caisseId, undefined, formulaire({ texte: avecCanal, intention: "analyser" }));
    expect(encore?.apercu?.resume.canauxCorriges).toBe(0);
  });
});

describe("colonne Canal : un canal par versé", () => {
  it("chaque paiement repris garde le canal de sa ligne ; le choix général n'est pas demandé", async () => {
    const autre = await prisma.caisse.create({ data: { ownerId, nom: "Cotisation fête", type: "COLLECTE", montantCotisation: 1_000, dateLimite: new Date("2030-02-01") } });
    await prisma.cycle.create({ data: { caisseId: autre.id, numero: 1, dateDebut: new Date("2030-01-01"), dateEcheance: new Date("2030-02-01") } });
    const liste = ["Nom complet\tTéléphone\tVersé\tCanal", "Ndeye Sarr\t770000001\t1 000\tOrange Money", "Pape Ba\t770000002\t1 000\tcash"].join("\n");

    const etat = await traiterImport(autre.id, undefined, formulaire({ texte: liste, intention: "importer" }));
    expect(etat?.erreur).toBeUndefined();
    const paiements = await prisma.paiement.findMany({
      where: { ownerId, allocations: { some: { echeance: { cycle: { caisseId: autre.id } } } } },
      select: { canal: true, personne: { select: { nomComplet: true } } },
      orderBy: { personne: { nomComplet: "asc" } },
    });
    expect(paiements.map((p) => [p.personne?.nomComplet, p.canal])).toEqual([
      ["Ndeye Sarr", "ORANGE_MONEY"],
      ["Pape Ba", "CASH"],
    ]);
  });
});
