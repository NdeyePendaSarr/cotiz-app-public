import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 1 : validations SIMULTANÉES sur la base LOCALE (double appui, deux onglets). Chaque
// Promise.all lance de vraies transactions en parallèle sur des connexions différentes : sans les
// verrous de lib/verrous.ts, elles lisaient le même reste dû et affectaient plus que l'argent reçu.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

const session = vi.hoisted(() => ({ courante: null as null | { id: string; email: string; nom: string } }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth", () => ({ exigerUtilisatrice: vi.fn(async () => session.courante) }));

const { prisma } = await import("@/lib/prisma");
const rapprochement = await import("@/app/actions/rapprochement");
const { marquerRembourse } = await import("@/app/actions/remboursement");

function formulaire(champs: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) for (const v of [valeur].flat()) fd.append(cle, v);
  return fd;
}

const ownerId = randomUUID();
const JOUR = 86_400_000;
let personneId = "";
let e1 = "";
let e2 = "";

/** Paiement Wave « à rapprocher » de la personne (numéro connu : sûr si le compte tombe juste). */
const paiement = (montant: number) =>
  prisma.paiement.create({
    data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant, telephoneExpediteur: "771112233", reference: `T_${randomUUID()}`, dateReception: new Date() },
  });
const alloueSur = async (echeanceId: string) => (await prisma.allocation.aggregate({ where: { echeanceId }, _sum: { montant: true } }))._sum.montant ?? 0;

beforeAll(async () => {
  session.courante = { id: ownerId, email: `concurrence-${ownerId.slice(0, 8)}@cotiz.test`, nom: "Concurrence" };
  await prisma.utilisatrice.create({ data: session.courante });
  const personne = await prisma.personne.create({ data: { ownerId, nomComplet: "Awa Concurrence", numeros: { create: { ownerId, numero: "771112233" } } } });
  personneId = personne.id;
  // Awa est membre de deux tontines : une échéance de 10 000 dans chacune.
  for (const [nom, cible] of [["Tontine 1", "e1"], ["Tontine 2", "e2"]] as const) {
    const caisse = await prisma.caisse.create({ data: { ownerId, nom, montantCotisation: 10_000, frequence: "MENSUELLE", jourEcheance: 5 } });
    const membre = await prisma.membreCaisse.create({ data: { caisseId: caisse.id, personneId, ordrePassage: 1 } });
    const debut = new Date(new Date().toISOString().slice(0, 10));
    const cycle = await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 1, dateDebut: debut, dateEcheance: new Date(debut.getTime() + 10 * JOUR) } });
    const echeance = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: 10_000 } });
    if (cible === "e1") e1 = echeance.id;
    else e2 = echeance.id;
  }
});

afterAll(async () => {
  await prisma.utilisatrice.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe("validations simultanées (audit, lot 1)", () => {
  it("le même paiement validé deux fois en même temps, sur deux échéances : une seule validation passe", async () => {
    const p = await paiement(10_000);
    const [r1, r2] = await Promise.all([
      rapprochement.validerRapprochement(p.id, undefined, formulaire({ personneId, [`ligne-${e1}`]: "10000" })),
      rapprochement.validerRapprochement(p.id, undefined, formulaire({ personneId, [`ligne-${e2}`]: "10000" })),
    ]);
    expect([r1, r2].filter((r) => r?.erreur)).toHaveLength(1);
    const total = (await prisma.allocation.aggregate({ where: { paiementId: p.id }, _sum: { montant: true } }))._sum.montant;
    expect(total).toBe(10_000); // jamais 20 000 pour un paiement de 10 000
    // Remise à zéro pour le test suivant : on libère l'échéance prise.
    await prisma.allocation.deleteMany({ where: { paiementId: p.id } });
    await prisma.paiement.update({ where: { id: p.id }, data: { statut: "IGNORE" } });
  });

  it("deux paiements validés en même temps sur la même échéance : elle n'est jamais payée deux fois", async () => {
    const [p1, p2] = await Promise.all([paiement(10_000), paiement(10_000)]);
    const [r1, r2] = await Promise.all([
      rapprochement.validerRapprochement(p1.id, undefined, formulaire({ personneId, [`ligne-${e1}`]: "10000" })),
      rapprochement.validerRapprochement(p2.id, undefined, formulaire({ personneId, [`ligne-${e1}`]: "10000" })),
    ]);
    expect([r1, r2].filter((r) => r?.erreur)).toHaveLength(1);
    expect(await alloueSur(e1)).toBe(10_000);
  });

  it("« Valider les sûrs » envoyé deux fois en même temps : chaque échéance reste payée une seule fois", async () => {
    const p = await paiement(10_000); // seule échéance encore due : e2 (sûr : numéro connu, compte juste)
    await Promise.all([rapprochement.validerSurs(formulaire({ paiementId: [p.id] })), rapprochement.validerSurs(formulaire({ paiementId: [p.id] }))]);
    expect(await alloueSur(e2)).toBe(10_000);
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: p.id } })).statut).toBe("RAPPROCHE");
  });
});

describe("cotisations dues en une requête SQL (audit, lot 3)", () => {
  it("donne exactement le même résultat que l'ancien calcul (tout lire, puis filtrer en mémoire)", async () => {
    const { echeancesDues } = await import("@/lib/donnees/rapprochement");
    // En plus des échéances payées des tests précédents : une partiellement payée, une pas du tout.
    const nouvelle = async (nom: string) => {
      const caisse = await prisma.caisse.create({ data: { ownerId, nom, montantCotisation: 10_000, frequence: "MENSUELLE", jourEcheance: 5 } });
      const membre = await prisma.membreCaisse.create({ data: { caisseId: caisse.id, personneId, ordrePassage: 1 } });
      const debut = new Date(new Date().toISOString().slice(0, 10));
      const cycle = await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 1, dateDebut: debut, dateEcheance: new Date(debut.getTime() + 10 * JOUR) } });
      return prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: 10_000 } });
    };
    const e4 = await nouvelle("Tontine partielle");
    await nouvelle("Tontine impayée");
    const partiel = await paiement(4_000);
    await prisma.allocation.create({ data: { paiementId: partiel.id, echeanceId: e4.id, montant: 4_000 } });

    const toutes = await prisma.echeance.findMany({
      where: { membre: { caisse: { ownerId } } },
      select: { id: true, montantDu: true, allocations: { select: { montant: true } } },
    });
    const attendues = toutes
      .map((e) => ({ id: e.id, dejaAlloue: e.allocations.reduce((s, a) => s + a.montant, 0), montantDu: e.montantDu }))
      .filter((e) => e.dejaAlloue < e.montantDu)
      .sort((a, b) => a.id.localeCompare(b.id));

    const obtenues = Object.values(await echeancesDues(prisma, ownerId))
      .flat()
      .map((e) => ({ id: e.id, dejaAlloue: e.dejaAlloue, montantDu: e.montantDu }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(obtenues).toEqual(attendues);
    expect(obtenues.some((e) => e.dejaAlloue === 4_000)).toBe(true); // le cas partiel est bien couvert
    // Filtre par personne : mêmes échéances.
    expect((await echeancesDues(prisma, ownerId, personneId))[personneId]?.length).toBe(attendues.length);
  });
});

describe("excédents (audit, lot 1)", () => {
  it("« Marquer remboursé » ne marque pas un excédent entièrement gardé en bonne volonté", async () => {
    const p = await prisma.paiement.create({
      data: { ownerId, canal: "WAVE", source: "SAISIE_MANUELLE", montant: 5_000, personneId, statut: "RAPPROCHE", rapprocheLe: new Date(), dateReception: new Date() },
    });
    const caisse = await prisma.caisse.findFirstOrThrow({ where: { ownerId } });
    await prisma.don.create({ data: { ownerId, caisseId: caisse.id, paiementId: p.id, date: new Date(), montant: 5_000, donateur: "Awa", canal: "WAVE" } });
    await marquerRembourse(formulaire({ paiementId: p.id }));
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: p.id } })).rembourseLe).toBeNull();
  });

  it("un rapprochement dont l'excédent a été remboursé ne peut plus être annulé", async () => {
    // Paiement de 15 000 sur l'échéance e1 déjà payée ? Non : nouvelle personne, nouvelle échéance.
    const caisse = await prisma.caisse.create({ data: { ownerId, nom: "Tontine 3", montantCotisation: 10_000, frequence: "MENSUELLE", jourEcheance: 5 } });
    const membre = await prisma.membreCaisse.create({ data: { caisseId: caisse.id, personneId, ordrePassage: 1 } });
    const debut = new Date(new Date().toISOString().slice(0, 10));
    const cycle = await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 1, dateDebut: debut, dateEcheance: new Date(debut.getTime() + 10 * JOUR) } });
    const e3 = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: 10_000 } });
    const p = await paiement(15_000);
    expect(await rapprochement.validerRapprochement(p.id, undefined, formulaire({ personneId, [`ligne-${e3.id}`]: "10000" }))).toBeUndefined();
    await marquerRembourse(formulaire({ paiementId: p.id }));
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: p.id } })).rembourseLe).not.toBeNull();

    await rapprochement.annulerRapprochement(formulaire({ paiementId: p.id }));
    const apres = await prisma.paiement.findUniqueOrThrow({ where: { id: p.id }, include: { allocations: true } });
    expect(apres.statut).toBe("RAPPROCHE");
    expect(apres.allocations).toHaveLength(1);
  });
});

describe("datation des versés repris (audit du 03/11/2026)", () => {
  it("deux datations simultanées avec le même SMS : une seule passe, le SMS ne date qu'un versé", async () => {
    const { daterRepriseALaMain } = await import("@/app/actions/datation");
    const reprise = () =>
      prisma.paiement.create({
        data: { ownerId, canal: "WAVE", source: "SAISIE_MANUELLE", montant: 2_000, personneId, statut: "RAPPROCHE", rapprocheLe: new Date(), dateReception: new Date(), origine: "REPRISE_IMPORT", datation: "NON_DATEE" },
      });
    const [r1, r2] = [await reprise(), await reprise()];
    const sms = await prisma.paiement.create({
      data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant: 2_000, statut: "IGNORE", reference: `T_${randomUUID()}`, dateReception: new Date(Date.now() - 3 * JOUR) },
    });

    await Promise.all([r1, r2].map((r) => daterRepriseALaMain(r.id, formulaire({ smsId: sms.id }))));

    const datees = await prisma.paiement.findMany({ where: { id: { in: [r1.id, r2.id] }, datation: "PAR_SMS" }, select: { id: true } });
    expect(datees).toHaveLength(1);
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: sms.id } })).dateRepriseId).toBe(datees[0].id);
  });
});
