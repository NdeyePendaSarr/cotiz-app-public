import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Comptes gardés, sur la base LOCALE : isolation entre deux trésorières (A ne lit ni ne modifie
// rien chez B), puis le parcours de A : versement saisi, paiement versé sur le compte au
// rapprochement (jamais « à rembourser », hors statistiques), annulation, import sans doublon.
// Seule la session est simulée ; Zod, Prisma et la base tournent pour de vrai.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test des comptes gardés refusé : ${refus}`);

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
vi.mock("@/lib/annonce", () => ({ annoncer: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  exigerUtilisatrice: vi.fn(async () => {
    if (!session.courante) throw new Error("Pas de session simulée");
    return session.courante;
  }),
}));

const { prisma } = await import("@/lib/prisma");
const caisses = await import("@/app/actions/caisses");
const comptes = await import("@/app/actions/comptes");
const rapprochement = await import("@/app/actions/rapprochement");
const importListe = await import("@/app/actions/import");
const membres = await import("@/app/actions/membres");
const personnes = await import("@/app/actions/personnes");
const lectures = await import("@/lib/donnees/comptes");
const lecturesSuivi = await import("@/lib/donnees/suivi");
const lecturesStatistiques = await import("@/lib/donnees/statistiques");

const JOUR = 86_400_000;
const aujourdhuiUtc = () => new Date(new Date().toISOString().slice(0, 10));
const jourIso = (d: Date) => d.toISOString().slice(0, 10);

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

async function creerJeu(nom: string) {
  const id = randomUUID();
  const utilisatrice = { id, email: `comptes-${nom}-${id.slice(0, 8)}@cotiz.test`, nom: `Comptes ${nom}` };
  await prisma.utilisatrice.create({ data: utilisatrice });
  const frere = await prisma.personne.create({ data: { ownerId: id, nomComplet: `Modou ${nom}`, numeros: { create: { ownerId: id, numero: "781112233" } } } });
  const autre = await prisma.personne.create({ data: { ownerId: id, nomComplet: `Awa ${nom}` } });
  const compte = await prisma.caisse.create({
    data: { ownerId: id, nom: `Épargne ${nom}`, type: "COMPTE_GARDE", montantCotisation: 0, membres: { create: { personneId: frere.id } } },
  });
  const mouvement = await prisma.mouvementCompte.create({
    data: { ownerId: id, caisseId: compte.id, date: new Date(aujourdhuiUtc().getTime() - 10 * JOUR), montant: 50_000, sens: "VERSEMENT", canal: "CASH" },
  });
  const paiement = await prisma.paiement.create({
    data: { ownerId: id, canal: "WAVE", source: "SMS_WAVE", montant: 20_000, telephoneExpediteur: "781112233", reference: `T_${randomUUID()}`, dateReception: new Date(Date.now() - JOUR) },
  });
  return { utilisatrice, frere, autre, compte, mouvement, paiement };
}

async function etat(ownerId: string) {
  const parId = { id: "asc" } as const;
  return {
    caisses: await prisma.caisse.findMany({ where: { ownerId }, orderBy: parId, include: { membres: { orderBy: parId } } }),
    mouvements: await prisma.mouvementCompte.findMany({ where: { ownerId }, orderBy: parId }),
    paiements: await prisma.paiement.findMany({ where: { ownerId }, orderBy: parId }),
    journal: await prisma.journalAudit.count({ where: { ownerId } }),
  };
}

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

async function sansRedirection<T>(appel: Promise<T>) {
  try {
    return await appel;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT")) throw new Error(`L'action a abouti (${e.message}) au lieu d'être refusée`);
    throw e;
  }
}

let a: Jeu;
let b: Jeu;

beforeAll(async () => {
  a = await creerJeu("A");
  b = await creerJeu("B");
  session.courante = a.utilisatrice;
});

afterAll(async () => {
  await prisma.utilisatrice.deleteMany({ where: { id: { in: [a?.utilisatrice.id, b?.utilisatrice.id].filter(Boolean) } } });
  await prisma.$disconnect();
});

const mouvement = (champs: Partial<Record<"date" | "montant" | "sens" | "canal" | "note", string>> = {}) =>
  formulaire({ date: jourIso(aujourdhuiUtc()), montant: "5 000", sens: "RETRAIT", canal: "WAVE", note: "", ...champs });

describe("comptes gardés : un seul membre, son titulaire", () => {
  const membresDuCompte = () => prisma.membreCaisse.findMany({ where: { caisseId: a.compte.id }, select: { personneId: true, statut: true } });

  it("ni inscription, ni création de personne, ni import de liste, ni retrait du titulaire", async () => {
    await sansRedirection(membres.ajouterMembre(formulaire({ caisseId: a.compte.id, personneId: a.autre.id })));
    await sansRedirection(membres.inscrirePersonneExistante(a.compte.id, a.autre.id));
    const nouvelle = { nomComplet: "Nouvelle personne", cellule: "", aliasWave: "", numeros: "" };
    expect(await sansRedirection(personnes.creerPersonne(a.compte.id, undefined, formulaire(nouvelle)))).toMatchObject({ erreur: "Caisse introuvable ou archivée." });
    expect(await sansRedirection(importListe.traiterImport(a.compte.id, undefined, formulaire({ texte: "Prénom\tNom\nAwa\tNdiaye", intention: "importer", canal: "CASH" })))).toMatchObject({ erreur: "Caisse introuvable ou archivée." });
    const titulaire = await prisma.membreCaisse.findFirstOrThrow({ where: { caisseId: a.compte.id } });
    await sansRedirection(membres.changerStatutMembre(formulaire({ membreId: titulaire.id, statut: "INACTIF" })));
    expect(await membresDuCompte()).toEqual([{ personneId: a.frere.id, statut: "ACTIF" }]);
    expect(await prisma.personne.count({ where: { ownerId: a.utilisatrice.id, nomComplet: "Nouvelle personne" } })).toBe(0);
  });

  it("compte ancien avec un 2e membre : le titulaire reste le premier inscrit", async () => {
    const hier = new Date(aujourdhuiUtc().getTime() - JOUR);
    await prisma.membreCaisse.updateMany({ where: { caisseId: a.compte.id, personneId: a.frere.id }, data: { dateEntree: hier } });
    const second = await prisma.membreCaisse.create({ data: { caisseId: a.compte.id, personneId: a.autre.id } });
    try {
      expect((await lectures.obtenirCompte(a.utilisatrice.id, a.compte.id))?.membres[0].personne.id).toBe(a.frere.id);
    } finally {
      await prisma.membreCaisse.delete({ where: { id: second.id } });
    }
  });

  it("import d'historique plafonné à 500 lignes", async () => {
    const texte = ["Date\tVersement\tRetrait", ...Array.from({ length: 501 }, () => "01/01/2026\t1 000\t")].join("\n");
    expect(await comptes.importerHistoriqueCompte(a.compte.id, undefined, formulaire({ texte, canal: "CASH", intention: "importer" }))).toEqual({ erreur: "500 lignes maximum par import." });
  });
});

describe("comptes gardés : isolation", () => {
  it("A ne lit rien du compte de B", async () => {
    const A = a.utilisatrice.id;
    expect(await lectures.obtenirCompte(A, b.compte.id)).toBeNull();
    expect(await lectures.obtenirMouvement(A, b.mouvement.id)).toBeNull();
    expect(Object.keys(await lectures.comptesParPersonne(A))).toEqual([a.frere.id]);
    expect([...(await lectures.resumesComptes(A)).keys()]).toEqual([a.compte.id]);
  });

  it("A ne peut rien modifier chez B, même avec ses identifiants", async () => {
    const avantB = await etat(b.utilisatrice.id);
    const avantA = await etat(a.utilisatrice.id);

    expect(await sansRedirection(comptes.creerMouvement(b.compte.id, undefined, mouvement()))).toHaveProperty("erreur");
    expect(await sansRedirection(comptes.modifierMouvement(b.mouvement.id, undefined, mouvement()))).toMatchObject({ erreur: "Mouvement introuvable." });
    await sansRedirection(comptes.supprimerMouvement(formulaire({ mouvementId: b.mouvement.id })));
    const texte = "Date\tVersement\tRetrait\n01/01/2026\t1 000\t";
    expect(await comptes.importerHistoriqueCompte(b.compte.id, undefined, formulaire({ texte, canal: "CASH", intention: "importer" }))).toHaveProperty("erreur");
    // Verser : le paiement de B, ou le compte de B avec la personne de B, ou le compte de B avec le paiement de A.
    for (const [paiementId, personneId, compteId] of [
      [b.paiement.id, b.frere.id, b.compte.id],
      [b.paiement.id, a.frere.id, a.compte.id],
      [a.paiement.id, b.frere.id, b.compte.id],
    ]) {
      expect(await rapprochement.verserSurCompte(paiementId, undefined, formulaire({ personneId, compteId }))).toHaveProperty("erreur");
    }
    // Titulaire d'un compte gardé : une personne de B est refusée.
    expect(await sansRedirection(caisses.creerCaisse(undefined, formulaire({ type: "COMPTE_GARDE", nom: "Piratage", titulaireId: b.frere.id })))).toMatchObject({
      erreurs: { titulaireId: expect.any(String) },
    });

    expect(await etat(b.utilisatrice.id)).toEqual(avantB);
    expect(await etat(a.utilisatrice.id)).toEqual(avantA);
  });
});

describe("comptes gardés : parcours de A", () => {
  it("création : le titulaire devient l'unique membre, sans cycle", async () => {
    await expect(caisses.creerCaisse(undefined, formulaire({ type: "COMPTE_GARDE", nom: "Épargne Awa", titulaireId: a.autre.id }))).rejects.toThrow(/^REDIRECT \/caisses\//);
    const cree = await prisma.caisse.findFirstOrThrow({ where: { ownerId: a.utilisatrice.id, nom: "Épargne Awa" }, include: { membres: true, cycles: true } });
    expect(cree).toMatchObject({ type: "COMPTE_GARDE", montantCotisation: 0, cycles: [] });
    expect(cree.membres.map((m) => m.personneId)).toEqual([a.autre.id]);
  });

  it("retrait saisi : le solde peut devenir négatif ; date future refusée", async () => {
    expect(await sansRedirection(comptes.creerMouvement(a.compte.id, undefined, mouvement({ date: jourIso(new Date(Date.now() + 2 * JOUR)) })))).toMatchObject({
      erreurs: { date: expect.any(String) },
    });
    await expect(comptes.creerMouvement(a.compte.id, undefined, mouvement({ montant: "60 000" }))).rejects.toThrow(`REDIRECT /caisses/${a.compte.id}`);
    expect((await lectures.resumesComptes(a.utilisatrice.id)).get(a.compte.id)?.solde).toBe(-10_000);
  });

  it("rapprochement : le paiement entier va sur le compte, jamais à rembourser ni dans les statistiques ; annulable", async () => {
    const A = a.utilisatrice.id;
    const aRembourserAvant = await lecturesSuivi.compterARembourser(A);
    // Le compte doit être celui de la personne choisie.
    expect(await rapprochement.verserSurCompte(a.paiement.id, undefined, formulaire({ personneId: a.autre.id, compteId: a.compte.id }))).toMatchObject({
      erreur: "Ce compte n'est pas celui de cette personne.",
    });

    expect(await rapprochement.verserSurCompte(a.paiement.id, undefined, formulaire({ personneId: a.frere.id, compteId: a.compte.id }))).toBeUndefined();
    const paiement = await prisma.paiement.findUniqueOrThrow({ where: { id: a.paiement.id }, include: { mouvementCompte: true } });
    expect(paiement).toMatchObject({ statut: "RAPPROCHE", personneId: a.frere.id });
    expect(paiement.mouvementCompte).toMatchObject({ caisseId: a.compte.id, montant: 20_000, sens: "VERSEMENT", canal: "WAVE" });
    expect((await lectures.resumesComptes(A)).get(a.compte.id)?.solde).toBe(10_000);
    expect(await lecturesSuivi.compterARembourser(A)).toBe(aRembourserAvant);
    expect((await lecturesSuivi.excedentsARembourser(A)).map((p) => p.id)).not.toContain(a.paiement.id);
    expect(await lecturesStatistiques.paiementsRecus(A, aujourdhuiUtc())).toEqual([]);
    // Deuxième validation : déjà traité.
    expect(await rapprochement.verserSurCompte(a.paiement.id, undefined, formulaire({ personneId: a.frere.id, compteId: a.compte.id }))).toHaveProperty("erreur");

    // Le versement lié ne se modifie ni ne se supprime depuis le compte.
    const lie = paiement.mouvementCompte!;
    expect(await sansRedirection(comptes.modifierMouvement(lie.id, undefined, mouvement()))).toMatchObject({ erreur: expect.stringMatching(/rapproché/) });
    await sansRedirection(comptes.supprimerMouvement(formulaire({ mouvementId: lie.id })));
    expect(await prisma.mouvementCompte.count({ where: { id: lie.id } })).toBe(1);

    // Annuler le rapprochement : le versement disparaît, le paiement redevient à rapprocher.
    await rapprochement.annulerRapprochement(formulaire({ paiementId: a.paiement.id }));
    expect(await prisma.mouvementCompte.count({ where: { id: lie.id } })).toBe(0);
    expect(await prisma.paiement.findUniqueOrThrow({ where: { id: a.paiement.id } })).toMatchObject({ statut: "A_RAPPROCHER", rapprocheLe: null });
    const journal = await prisma.journalAudit.findMany({ where: { ownerId: A, entite: "MouvementCompte", entiteId: lie.id }, orderBy: { id: "asc" }, select: { action: true } });
    expect(journal.map((l) => l.action)).toEqual(["CREATION", "SUPPRESSION"]);
  });

  it("import : aperçu, puis seuls les mouvements absents sont enregistrés", async () => {
    const dejaLa = jourIso(new Date(aujourdhuiUtc().getTime() - 10 * JOUR)).split("-").reverse().join("/"); // le versement de 50 000 du jeu
    const texte = ["Date\tVersement\tRetrait\tNote", `${dejaLa}\t50 000\t\t`, "02/01/2026\t\t7 500\tLoyer", "pas une date\t1 000\t\t"].join("\n");
    const apercu = await comptes.importerHistoriqueCompte(a.compte.id, undefined, formulaire({ texte, intention: "analyser" }));
    expect(apercu?.apercu).toMatchObject({ aImporter: 1, versements: 0, retraits: 7_500, sansCanal: 1 });
    expect(apercu?.apercu?.lignes.map((l) => [l.dejaEnregistre, Boolean(l.erreur)])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    // Canal manquant : refusé tant qu'il n'est pas choisi.
    expect(await comptes.importerHistoriqueCompte(a.compte.id, undefined, formulaire({ texte, intention: "importer" }))).toHaveProperty("erreur");

    const avant = await prisma.mouvementCompte.count({ where: { caisseId: a.compte.id } });
    const fait = await comptes.importerHistoriqueCompte(a.compte.id, undefined, formulaire({ texte, canal: "CASH", intention: "importer" }));
    expect(fait?.termine).toEqual({ importes: 1, versements: 0, retraits: 7_500 });
    expect(await prisma.mouvementCompte.count({ where: { caisseId: a.compte.id } })).toBe(avant + 1);
    // Réimport du même tableau : plus rien à importer.
    const encore = await comptes.importerHistoriqueCompte(a.compte.id, undefined, formulaire({ texte, canal: "CASH", intention: "analyser" }));
    expect(encore?.apercu?.aImporter).toBe(0);
  });
});
