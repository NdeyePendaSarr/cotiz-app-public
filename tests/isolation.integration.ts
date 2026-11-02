import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Critère d'acceptation : « une utilisatrice ne voit jamais les données d'une autre (testé
// avec 2 comptes) ». Deux trésorières A et B sont créées dans la base LOCALE avec chacune un
// jeu complet (caisses, membres, cycle, échéances, paiements, allocation, SMS non lu).
// Connectée en tant que A, on appelle chaque Server Action et chaque lecture avec les
// identifiants de B : rien ne doit être lu ni modifié. Seule la session est simulée
// (exigerUtilisatrice) : tout le reste, Zod, Prisma et la base, tourne pour de vrai.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test d'isolation refusé : ${refus}`);

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
const personnes = await import("@/app/actions/personnes");
const cycles = await import("@/app/actions/cycles");
const imports = await import("@/app/actions/import");
const capture = await import("@/app/actions/capture");
const rapprochement = await import("@/app/actions/rapprochement");
const remboursement = await import("@/app/actions/remboursement");
const actionsDepenses = await import("@/app/actions/depenses");
const actionsDons = await import("@/app/actions/dons");
const lecturesCaisses = await import("@/lib/donnees/caisses");
const lecturesPersonnes = await import("@/lib/donnees/personnes");
const lecturesMembres = await import("@/lib/donnees/membres");
const lecturesCycles = await import("@/lib/donnees/cycles");
const lecturesPaiements = await import("@/lib/donnees/paiements");
const lecturesRapprochement = await import("@/lib/donnees/rapprochement");
const lecturesSuivi = await import("@/lib/donnees/suivi");
const lecturesDepenses = await import("@/lib/donnees/depenses");
const lecturesStatistiques = await import("@/lib/donnees/statistiques");

type Jeu = Awaited<ReturnType<typeof creerJeu>>;

const JOUR = 86_400_000;
const aujourdhuiUtc = () => new Date(new Date().toISOString().slice(0, 10));

async function creerJeu(nom: string) {
  const id = randomUUID();
  const utilisatrice = { id, email: `isolation-${nom}-${id.slice(0, 8)}@cotiz.test`, nom: `Isolation ${nom}` };
  await prisma.utilisatrice.create({ data: utilisatrice });

  const tontine = await prisma.caisse.create({ data: { ownerId: id, nom: `Tontine ${nom}`, montantCotisation: 10_000, frequence: "MENSUELLE", jourEcheance: 5 } });
  const tontineSansCycle = await prisma.caisse.create({ data: { ownerId: id, nom: `Nouvelle ${nom}`, montantCotisation: 5_000, frequence: "MENSUELLE", jourEcheance: 10 } });
  const collecte = await prisma.caisse.create({
    data: { ownerId: id, nom: `Collecte ${nom}`, type: "COLLECTE", montantCotisation: 2_000, dateLimite: new Date(aujourdhuiUtc().getTime() + 30 * JOUR) },
  });

  const awa = await prisma.personne.create({ data: { ownerId: id, nomComplet: `Awa ${nom}`, numeros: { create: { ownerId: id, numero: "771234567" } } } });
  const fatou = await prisma.personne.create({ data: { ownerId: id, nomComplet: `Fatou ${nom}` } });
  const m1 = await prisma.membreCaisse.create({ data: { caisseId: tontine.id, personneId: awa.id, ordrePassage: 1 } });
  const m2 = await prisma.membreCaisse.create({ data: { caisseId: tontine.id, personneId: fatou.id, ordrePassage: 2 } });

  const cycle = await prisma.cycle.create({
    data: { caisseId: tontine.id, numero: 1, dateDebut: aujourdhuiUtc(), dateEcheance: new Date(aujourdhuiUtc().getTime() + 10 * JOUR) },
  });
  const e1 = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: m1.id, montantDu: 10_000 } });
  const e2 = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: m2.id, montantDu: 10_000 } });

  const hier = new Date(Date.now() - JOUR);
  const aRapprocher = await prisma.paiement.create({
    data: { ownerId: id, canal: "WAVE", source: "SMS_WAVE", montant: 10_000, telephoneExpediteur: "771234567", reference: `T_${randomUUID()}`, dateReception: hier },
  });
  const rapproche = await prisma.paiement.create({
    data: {
      ownerId: id,
      canal: "CASH",
      source: "SAISIE_MANUELLE",
      montant: 15_000,
      personneId: fatou.id,
      statut: "RAPPROCHE",
      rapprocheLe: new Date(),
      dateReception: hier,
      allocations: { create: { echeanceId: e2.id, montant: 10_000 } }, // excédent : 5 000
    },
  });
  const sms = await prisma.smsNonLu.create({ data: { ownerId: id, texteBrut: "SMS illisible" } });
  const depense = await prisma.depense.create({
    data: { ownerId: id, caisseId: collecte.id, date: aujourdhuiUtc(), montant: 3_000, motif: `Nourriture ${nom}`, canal: "CASH", categorie: "NOURRITURE" },
  });

  const don = await prisma.don.create({ data: { ownerId: id, caisseId: collecte.id, date: aujourdhuiUtc(), montant: 30_000, donateur: `Ibou ${nom}`, canal: "WAVE" } });

  return { utilisatrice, tontine, tontineSansCycle, collecte, awa, fatou, m1, m2, cycle, e1, e2, aRapprocher, rapproche, sms, depense, don };
}

/** Photographie de tout ce qui appartient à une utilisatrice, pour comparer avant / après. */
async function etat(ownerId: string) {
  const parId = { id: "asc" } as const;
  return {
    utilisatrice: await prisma.utilisatrice.findUnique({ where: { id: ownerId } }),
    caisses: await prisma.caisse.findMany({
      where: { ownerId },
      orderBy: parId,
      include: { membres: { orderBy: parId }, cycles: { orderBy: parId, include: { echeances: { orderBy: parId } } } },
    }),
    personnes: await prisma.personne.findMany({ where: { ownerId }, orderBy: parId, include: { numeros: { orderBy: parId } } }),
    paiements: await prisma.paiement.findMany({ where: { ownerId }, orderBy: parId, include: { allocations: { orderBy: { echeanceId: "asc" } } } }),
    sms: await prisma.smsNonLu.findMany({ where: { ownerId }, orderBy: parId }),
    depenses: await prisma.depense.findMany({ where: { ownerId }, orderBy: parId }),
    dons: await prisma.don.findMany({ where: { ownerId }, orderBy: parId }),
    journal: await prisma.journalAudit.count({ where: { ownerId } }),
  };
}

function formulaire(champs: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) for (const v of [valeur].flat()) fd.append(cle, v);
  return fd;
}

/** Une action qui redirige a réussi : ici, c'est un échec du test. */
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
let avantA: Awaited<ReturnType<typeof etat>>;
let avantB: Awaited<ReturnType<typeof etat>>;

beforeAll(async () => {
  a = await creerJeu("A");
  b = await creerJeu("B");
  avantA = await etat(a.utilisatrice.id);
  avantB = await etat(b.utilisatrice.id);
  session.courante = a.utilisatrice;
});

afterAll(async () => {
  // Cascade : supprimer l'Utilisatrice efface toutes ses données.
  await prisma.utilisatrice.deleteMany({ where: { id: { in: [a?.utilisatrice.id, b?.utilisatrice.id].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe("isolation entre deux trésorières", () => {
  it("les lectures de A ne renvoient jamais une donnée de B", async () => {
    const A = a.utilisatrice.id;
    expect(await lecturesCaisses.obtenirCaisse(A, b.tontine.id)).toBeNull();
    expect(await lecturesPersonnes.obtenirPersonne(A, b.awa.id)).toBeNull();
    expect(await lecturesMembres.listerMembres(A, b.tontine.id)).toEqual([]);
    expect(await lecturesCycles.obtenirCycleOuvert(A, b.tontine.id)).toBeNull();
    expect(await lecturesSuivi.suiviCaisse(A, b.tontine.id)).toBeNull();
    expect(await lecturesPaiements.historiquePaiement(A, b.rapproche.id)).toBeNull();
    expect(await lecturesPaiements.obtenirSmsNonLu(A, b.sms.id)).toBeNull();
    expect(await lecturesDepenses.obtenirDepense(A, b.depense.id)).toBeNull();
    const situation = await lecturesPersonnes.situationPersonne(A, b.fatou.id);
    expect(situation.paiements).toEqual([]);
    expect(situation.parMembre.size).toBe(0);
    expect(await lecturesDepenses.listerDepenses(A, b.collecte.id)).toEqual([]);
    expect(await lecturesDepenses.obtenirDon(A, b.don.id)).toBeNull();
    expect(await lecturesDepenses.listerDons(A, b.collecte.id)).toEqual([]);
    expect(await lecturesDepenses.encaisseCaisse(A, b.tontine.id)).toBe(0);
    expect(await lecturesRapprochement.echeancesDues(prisma, A, b.awa.id)).toEqual({});
    expect(await lecturesSuivi.historiqueCaisse(A, b.tontine.id)).toEqual([]);
    expect(await lecturesSuivi.historiquePersonne(A, b.fatou.id)).toEqual([]);
    expect(await lecturesSuivi.verseDepuis(A, b.fatou.id, new Date(0))).toBe(0);
    // Contrôle : les mêmes lectures sur A ne sont pas vides (le test ne passe pas à vide).
    expect(await lecturesSuivi.historiqueCaisse(A, a.tontine.id)).toHaveLength(2);
    expect(await lecturesSuivi.verseDepuis(A, a.fatou.id, new Date(0))).toBe(15_000);

    // Listes : uniquement des identifiants de A.
    const idsDeB = new Set(Object.values(b).flatMap((v) => (v && typeof v === "object" && "id" in v ? [v.id] : [])));
    const listes = await Promise.all([
      lecturesCaisses.listerCaisses(A),
      lecturesPersonnes.listerPersonnes(A),
      lecturesPaiements.derniersPaiements(A, 100),
      lecturesPaiements.listerSmsNonLus(A),
      lecturesRapprochement.paiementsARapprocher(A),
      lecturesRapprochement.derniersRapproches(A),
      lecturesSuivi.excedentsARembourser(A),
      lecturesSuivi.listerCaissesPourSelecteur(A),
      lecturesSuivi.cyclesOuverts(A),
    ]);
    for (const liste of listes) {
      expect(liste.length).toBeGreaterThan(0); // A a bien ses propres données : le test ne passe pas à vide
      for (const ligne of liste) expect(idsDeB.has(ligne.id)).toBe(false);
    }
    // Compteur calculé en SQL (navigation) : seulement les excédents de A, comme la liste.
    expect(await lecturesSuivi.compterARembourser(A)).toBe((await lecturesSuivi.excedentsARembourser(A)).length);
    // Graphiques de l'accueil : seulement les deux paiements de A (10 000 Wave + 15 000 cash, hier).
    const recus = await lecturesStatistiques.paiementsRecus(A, aujourdhuiUtc());
    expect(recus.reduce((s, p) => s + p.montant, 0)).toBe(25_000);
  });

  it("A ne peut rien modifier chez B, même en envoyant ses identifiants", async () => {
    const ligneSurB = { [`ligne-${b.e1.id}`]: "10000" };

    // Caisses
    await caisses.changerStatutCaisse(formulaire({ id: b.tontine.id, statut: "ARCHIVEE" }));
    const champsCaisse = { type: "TONTINE", nom: "Piratée", montantCotisation: "1000", frequence: "MENSUELLE", jourEcheance: "5", dateLimite: "", modeleRelance: "" };
    expect(await sansRedirection(caisses.modifierCaisse(b.tontine.id, undefined, formulaire(champsCaisse)))).toMatchObject({ erreur: "Caisse introuvable." });

    // Membres : caisse de B, personne de B, mélange A/B
    await sansRedirection(membres.ajouterMembre(formulaire({ caisseId: b.tontine.id, personneId: a.awa.id })));
    await sansRedirection(membres.ajouterMembre(formulaire({ caisseId: a.tontineSansCycle.id, personneId: b.awa.id })));
    await membres.changerStatutMembre(formulaire({ membreId: b.m1.id, statut: "INACTIF" }));
    expect(await membres.attribuerOrdre(undefined, formulaire({ membreId: b.m1.id, ordre: "9" }))).toMatchObject({ erreur: "Membre introuvable." });
    expect(await membres.echangerOrdres(undefined, formulaire({ caisseId: b.tontine.id, membreA: b.m1.id, membreB: b.m2.id }))).toHaveProperty("erreur");

    // Personnes
    const champsPersonne = { nomComplet: "Piratée", numero: "770000000", libelle: "" };
    expect(await sansRedirection(personnes.modifierPersonne(b.awa.id, undefined, formulaire(champsPersonne)))).toMatchObject({ erreur: "Personne introuvable." });

    // Cycles et import
    expect(await cycles.ouvrirPremierCycle(b.tontineSansCycle.id, undefined, formulaire({ numero: "1", dateEcheance: "2030-01-05" }))).toHaveProperty("erreur");
    await cycles.creerCycleCollecte(formulaire({ caisseId: b.collecte.id }));
    expect(await cycles.cloturerCycle(b.tontine.id)).toHaveProperty("erreur");
    expect(await imports.traiterImport(b.tontine.id, undefined, formulaire({ texte: "Awa Diop;771111111", intention: "importer" }))).toHaveProperty("erreur");

    // Capture : SMS non lu de B, personne de B
    const saisie = { canal: "CASH", montant: "5000", date: new Date(Date.now() - JOUR).toISOString().slice(0, 10), heure: "10:00", reference: "", note: "" };
    expect(await sansRedirection(capture.saisirPaiement(b.sms.id, undefined, formulaire({ ...saisie, personneId: "" })))).toHaveProperty("erreur");
    expect(await capture.saisirPaiement(null, undefined, formulaire({ ...saisie, personneId: b.awa.id }))).toMatchObject({ erreurs: { personneId: "Personne introuvable." } });
    await capture.marquerSmsTraite(formulaire({ smsId: b.sms.id }));

    // Rapprochement : paiement de B ; paiement de A réparti sur une échéance ou une personne de B
    expect(await rapprochement.validerRapprochement(b.aRapprocher.id, undefined, formulaire({ personneId: b.awa.id, ...ligneSurB }))).toHaveProperty("erreur");
    expect(await rapprochement.validerRapprochement(a.aRapprocher.id, undefined, formulaire({ personneId: b.awa.id, ...ligneSurB }))).toHaveProperty("erreur");
    expect(await rapprochement.validerRapprochement(a.aRapprocher.id, undefined, formulaire({ personneId: a.awa.id, ...ligneSurB }))).toHaveProperty("erreur");
    // Validation groupée (lot 4) : le paiement de B est « sûr » chez B (numéro connu, compte juste), jamais chez A.
    await rapprochement.validerSurs(formulaire({ paiementId: [b.aRapprocher.id] }));
    await rapprochement.ignorerPaiement(formulaire({ paiementId: b.aRapprocher.id }));
    await rapprochement.remettreARapprocher(formulaire({ paiementId: b.aRapprocher.id }));
    await rapprochement.annulerRapprochement(formulaire({ paiementId: b.rapproche.id }));
    await remboursement.marquerRembourse(formulaire({ paiementId: b.rapproche.id }));

    // Dépenses (phase 11) : créer dans la collecte de B, modifier ou supprimer une dépense de B.
    const champsDepense = { date: aujourdhuiUtc().toISOString().slice(0, 10), montant: "999", motif: "Piratage", beneficiaire: "", canal: "CASH", categorie: "AUTRE" };
    expect(await sansRedirection(actionsDepenses.creerDepense(b.collecte.id, undefined, formulaire(champsDepense)))).toHaveProperty("erreur");
    expect(await sansRedirection(actionsDepenses.modifierDepense(b.depense.id, undefined, formulaire(champsDepense)))).toMatchObject({ erreur: "Dépense introuvable." });
    await sansRedirection(actionsDepenses.supprimerDepense(formulaire({ depenseId: b.depense.id })));

    // Bonnes volontés : créer dans la collecte de B, modifier ou supprimer un don de B, garder l'excédent d'un paiement de B.
    const champsDon = { date: aujourdhuiUtc().toISOString().slice(0, 10), montant: "999", donateur: "Piratage", canal: "CASH", note: "" };
    expect(await sansRedirection(actionsDons.creerDon(b.collecte.id, undefined, formulaire(champsDon)))).toHaveProperty("erreur");
    expect(await sansRedirection(actionsDons.modifierDon(b.don.id, undefined, formulaire(champsDon)))).toMatchObject({ erreur: "Bonne volonté introuvable." });
    await sansRedirection(actionsDons.supprimerDon(formulaire({ donId: b.don.id })));
    await actionsDons.garderCommeDon(formulaire({ paiementId: b.rapproche.id }));

    // Rien n'a bougé, ni chez B, ni chez A (aucune donnée de B rattachée à A).
    expect(await etat(b.utilisatrice.id)).toEqual(avantB);
    expect(await etat(a.utilisatrice.id)).toEqual(avantA);
  });

  it("contrôle : les mêmes actions fonctionnent sur les données de A", async () => {
    // Prouve que les refus ci-dessus viennent du filtre ownerId, pas d'un formulaire mal rempli.
    await remboursement.marquerRembourse(formulaire({ paiementId: a.rapproche.id }));
    await rapprochement.ignorerPaiement(formulaire({ paiementId: a.aRapprocher.id }));
    await capture.marquerSmsTraite(formulaire({ smsId: a.sms.id }));
    // Dépense de A : création acceptée (la redirection vers la caisse signe la réussite).
    const champsDepense = { date: aujourdhuiUtc().toISOString().slice(0, 10), montant: "2 000", motif: "Transport", beneficiaire: "Pape Fall", canal: "WAVE", categorie: "TRANSPORT" };
    await expect(actionsDepenses.creerDepense(a.collecte.id, undefined, formulaire(champsDepense))).rejects.toThrow(`REDIRECT /caisses/${a.collecte.id}`);
    const champsDon = { date: aujourdhuiUtc().toISOString().slice(0, 10), montant: "3 000", donateur: "ABK", canal: "WAVE", note: "" };
    await expect(actionsDons.creerDon(a.collecte.id, undefined, formulaire(champsDon))).rejects.toThrow(`REDIRECT /caisses/${a.collecte.id}?vue=dons`);
    await caisses.changerStatutCaisse(formulaire({ id: a.collecte.id, statut: "ARCHIVEE" }));

    const apres = await etat(a.utilisatrice.id);
    expect(apres.paiements.find((p) => p.id === a.rapproche.id)?.rembourseLe).not.toBeNull();
    expect(apres.paiements.find((p) => p.id === a.aRapprocher.id)?.statut).toBe("IGNORE");
    expect(apres.sms[0].statut).toBe("TRAITE");
    expect(apres.caisses.find((c) => c.id === a.collecte.id)?.statut).toBe("ARCHIVEE");
    expect(apres.depenses.map((d) => [d.motif, d.montant, d.beneficiaire])).toContainEqual(["Transport", 2_000, "Pape Fall"]);
    expect(apres.dons.map((d) => [d.donateur, d.montant])).toContainEqual(["ABK", 3_000]);
    expect(apres.journal).toBe(avantA.journal + 5); // remboursement, ignoré, SMS traité, dépense, bonne volonté
  });

  it("contrôle : la validation groupée rapproche un paiement sûr de A, et seulement lui", async () => {
    // Numéro d'Awa, 10 000 = reste dû de son échéance e1 : sûr. Envoyé avec un paiement de B, qui est ignoré.
    const sur = await prisma.paiement.create({
      data: { ownerId: a.utilisatrice.id, canal: "WAVE", source: "SMS_WAVE", montant: 10_000, telephoneExpediteur: "771234567", reference: `T_${randomUUID()}`, dateReception: new Date() },
    });
    await rapprochement.validerSurs(formulaire({ paiementId: [sur.id, b.aRapprocher.id] }));

    const apres = await prisma.paiement.findUnique({ where: { id: sur.id }, include: { allocations: true } });
    expect(apres?.statut).toBe("RAPPROCHE");
    expect(apres?.personneId).toBe(a.awa.id);
    expect(apres?.allocations.map((l) => [l.echeanceId, l.montant])).toEqual([[a.e1.id, 10_000]]);
    expect(await prisma.journalAudit.count({ where: { ownerId: a.utilisatrice.id, entiteId: { startsWith: sur.id } } })).toBe(2); // paiement + allocation
    expect(await etat(b.utilisatrice.id)).toEqual(avantB);
  });

  it("validation groupée : le SMS passe avant le versé de la liste importée pour la même cotisation", async () => {
    const A = a.utilisatrice.id;
    const caisse = await prisma.caisse.create({ data: { ownerId: A, nom: "Doublon SMS", montantCotisation: 5_000, frequence: "MENSUELLE", jourEcheance: 5 } });
    const membre = await prisma.membreCaisse.create({ data: { caisseId: caisse.id, personneId: a.awa.id, ordrePassage: 1 } });
    const cycle = await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 1, dateDebut: aujourdhuiUtc(), dateEcheance: new Date(aujourdhuiUtc().getTime() + 5 * JOUR) } });
    const echeance = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: 5_000 } });
    // Le versé repris (annulé puis « à rapprocher ») est plus ANCIEN que le SMS : l'ordre ne vient pas de la date.
    const reprise = await prisma.paiement.create({
      data: { ownerId: A, canal: "WAVE", source: "SAISIE_MANUELLE", montant: 5_000, personneId: a.awa.id, origine: "REPRISE_IMPORT", datation: "NON_DATEE", dateReception: new Date(Date.now() - 3 * JOUR) },
    });
    const sms = await prisma.paiement.create({
      data: { ownerId: A, canal: "WAVE", source: "SMS_WAVE", montant: 5_000, telephoneExpediteur: "771234567", reference: `T_${randomUUID()}`, dateReception: new Date() },
    });

    await rapprochement.validerSurs(formulaire({ paiementId: [reprise.id, sms.id] }));
    const [apresSms, apresReprise] = await Promise.all([
      prisma.paiement.findUnique({ where: { id: sms.id }, include: { allocations: true } }),
      prisma.paiement.findUnique({ where: { id: reprise.id }, include: { allocations: true } }),
    ]);
    expect(apresSms?.statut).toBe("RAPPROCHE");
    expect(apresSms?.allocations.map((l) => l.echeanceId)).toEqual([echeance.id]);
    expect(apresReprise?.statut).toBe("A_RAPPROCHER"); // plus rien de dû : laissé « à vérifier », jamais compté deux fois
    expect(apresReprise?.allocations).toEqual([]);
  });

  it("doublons de l'import : A n'ignore que les siens, jamais ceux de B", async () => {
    // Chez A et chez B : Fatou est payée par un versé repris d'une liste importée, puis un SMS de
    // Fatou a été validé sans aucune échéance (tout « à rembourser ») : le même argent compté deux fois.
    const doublon = async (jeu: Jeu) => {
      await prisma.paiement.update({ where: { id: jeu.rapproche.id }, data: { origine: "REPRISE_IMPORT", datation: "NON_DATEE" } });
      return prisma.paiement.create({
        data: { ownerId: jeu.utilisatrice.id, canal: "WAVE", source: "SMS_WAVE", montant: 10_000, personneId: jeu.fatou.id, statut: "RAPPROCHE", rapprocheLe: new Date(), reference: `T_${randomUUID()}`, dateReception: new Date() },
      });
    };
    const chezA = await doublon(a);
    const chezB = await doublon(b);
    expect(Object.keys(await lecturesSuivi.payeesParImport(prisma, a.utilisatrice.id))).toEqual([a.fatou.id]);

    await remboursement.ignorerDoublons(formulaire({ paiementId: [chezA.id, chezB.id] }));
    expect((await prisma.paiement.findUnique({ where: { id: chezA.id } }))?.statut).toBe("IGNORE");
    expect((await prisma.paiement.findUnique({ where: { id: chezB.id } }))?.statut).toBe("RAPPROCHE");
    // Le versé repris lui-même n'est jamais ignoré, même envoyé exprès.
    await remboursement.ignorerDoublons(formulaire({ paiementId: [a.rapproche.id] }));
    expect((await prisma.paiement.findUnique({ where: { id: a.rapproche.id } }))?.statut).toBe("RAPPROCHE");
  });

  it("dater les versés importés avec leur SMS : seulement chez A, SMS bloqué ensuite", async () => {
    // Suite du test précédent : chez A et B, le paiement « rapproche » (15 000, Fatou) est un versé repris non daté.
    const { daterRepriseParSms } = await import("@/app/actions/datation");
    const ignore = (jeu: Jeu) =>
      prisma.paiement.create({
        data: { ownerId: jeu.utilisatrice.id, canal: "WAVE", source: "SMS_WAVE", montant: 15_000, personneId: jeu.fatou.id, statut: "IGNORE", reference: `T_${randomUUID()}`, dateReception: new Date("2026-10-20T08:30:00Z") },
      });
    const smsA = await ignore(a);
    const smsB = await ignore(b);

    await daterRepriseParSms();
    const [repriseA, repriseB, apresSmsA, apresSmsB] = await Promise.all(
      [a.rapproche.id, b.rapproche.id, smsA.id, smsB.id].map((id) => prisma.paiement.findUniqueOrThrow({ where: { id } })),
    );
    expect(repriseA).toMatchObject({ datation: "PAR_SMS", statut: "RAPPROCHE", montant: 15_000, dateReception: smsA.dateReception });
    expect(apresSmsA).toMatchObject({ dateRepriseId: a.rapproche.id, statut: "IGNORE" });
    expect(repriseB.datation).toBe("NON_DATEE"); // rien chez B
    expect(apresSmsB.dateRepriseId).toBeNull();

    // Le SMS qui a daté le versé ne revient jamais dans les comptes ; le versé daté entre dans « Reçu par jour ».
    await rapprochement.remettreARapprocher(formulaire({ paiementId: smsA.id }));
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: smsA.id } })).statut).toBe("IGNORE");
    const recus = await lecturesStatistiques.paiementsRecus(a.utilisatrice.id, new Date("2026-10-20T00:00:00Z"));
    expect(recus.find((p) => p.montant === 15_000)?.reprise).toBe(false);
  });

  it("dater à la main : jamais un versé ni un SMS de B ; date saisie acceptée chez A", async () => {
    const { daterRepriseALaMain } = await import("@/app/actions/datation");
    const A = a.utilisatrice.id;
    const verseA = await prisma.paiement.create({
      data: { ownerId: A, canal: "CASH", source: "SAISIE_MANUELLE", montant: 4_000, personneId: a.awa.id, origine: "REPRISE_IMPORT", datation: "NON_DATEE", statut: "RAPPROCHE", rapprocheLe: new Date(), dateReception: new Date() },
    });
    const smsLibreB = await prisma.paiement.findFirstOrThrow({ where: { ownerId: b.utilisatrice.id, statut: "IGNORE", origine: "CAPTURE", dateRepriseId: null } });
    const avantB = await etat(b.utilisatrice.id);

    // Lecture : rien de B.
    const page = await lecturesRapprochement.versesADater(A);
    const idsB = new Set([b.rapproche.id, smsLibreB.id]);
    expect([...page.verses, ...page.sms].some((x) => idsB.has(x.id))).toBe(false);
    expect(page.verses.map((v) => v.id)).toContain(verseA.id);

    // Écriture : versé de B, puis SMS de B sur un versé de A : refusés.
    await daterRepriseALaMain(b.rapproche.id, formulaire({ date: "2026-10-01" }));
    await daterRepriseALaMain(verseA.id, formulaire({ smsId: smsLibreB.id }));
    expect(await etat(b.utilisatrice.id)).toEqual(avantB);
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verseA.id } })).datation).toBe("NON_DATEE");

    // Contrôle : date saisie chez A (payé en espèces, sans SMS).
    const hier = new Date(Date.now() - JOUR).toISOString().slice(0, 10);
    await daterRepriseALaMain(verseA.id, formulaire({ date: hier }));
    const apres = await prisma.paiement.findUniqueOrThrow({ where: { id: verseA.id } });
    expect(apres).toMatchObject({ datation: "A_LA_MAIN", dateReception: new Date(`${hier}T12:00:00.000Z`), montant: 4_000 });
  });

  it("dater un versé Wave en collant son SMS : date et référence reprises, aucun paiement créé", async () => {
    const { daterRepriseAvecSms } = await import("@/app/actions/datation");
    const { smsReception } = await import("./fixtures/sms/fictifs");
    const A = a.utilisatrice.id;
    const verse = (ownerId: string, personneId: string, montant: number) =>
      prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SAISIE_MANUELLE", montant, personneId, origine: "REPRISE_IMPORT", datation: "NON_DATEE", statut: "RAPPROCHE", rapprocheLe: new Date(), dateReception: new Date() } });
    const verseA = await verse(A, a.awa.id, 2_000);
    const verseB = await verse(b.utilisatrice.id, b.awa.id, 2_000);
    const reference = `T${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const texte = smsReception({ montant: "2.000F", date: "18/10/2026 à 09h15", reference });
    const avant = await prisma.paiement.count({ where: { ownerId: A } });

    // Montant différent : refusé ; versé de B : refusé.
    expect(await daterRepriseAvecSms(verseA.id, undefined, formulaire({ texte: smsReception({ montant: "3.000F", reference: null }) }))).toHaveProperty("erreur");
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verseA.id } })).datation).toBe("NON_DATEE");
    expect(await daterRepriseAvecSms(verseB.id, undefined, formulaire({ texte }))).toHaveProperty("erreur");
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verseB.id } })).datation).toBe("NON_DATEE");

    expect(await daterRepriseAvecSms(verseA.id, undefined, formulaire({ texte }))).toBeUndefined();
    const apres = await prisma.paiement.findUniqueOrThrow({ where: { id: verseA.id } });
    expect(apres).toMatchObject({ datation: "PAR_SMS", reference, montant: 2_000, statut: "RAPPROCHE" });
    expect(apres.dateReception.toISOString().slice(0, 10)).toBe("2026-10-18");
    expect(await prisma.paiement.count({ where: { ownerId: A } })).toBe(avant); // aucun paiement en plus

    // Le même SMS collé plus tard en capture est reconnu comme déjà enregistré (pas de double compte).
    expect(await prisma.paiement.count({ where: { ownerId: A, canal: "WAVE", reference } })).toBe(1);

    // Ce même paiement Wave, saisi depuis l'application (ID avec « _ » et « - ») sur un AUTRE versé :
    // conflit précis, puis rattachement confirmé → l'autre versé redevient « sans date ».
    const { daterRepriseDepuisModele } = await import("@/app/actions/datation");
    const verse2 = await verse(A, a.fatou.id, 2_000);
    const idApplication = `${reference.slice(0, 1)}_${reference.slice(1, 8)}-${reference.slice(8)}`.toLowerCase();
    const champs = { texte: ["Vous avez recu 2.000F", "De Fatou A", "18/10/2026 à 09h15", `ID de transaction : ${idApplication}`].join("\n") };
    const conflit = await daterRepriseDepuisModele(verse2.id, undefined, formulaire(champs));
    expect(conflit?.conflit).toMatchObject({ rattachable: true });
    expect(conflit?.conflit?.message).toContain("Awa");
    expect(await daterRepriseDepuisModele(verse2.id, undefined, formulaire({ ...champs, rattacher: "1" }))).toBeUndefined();
    const [v1, v2] = await Promise.all([verseA.id, verse2.id].map((id) => prisma.paiement.findUniqueOrThrow({ where: { id } })));
    expect(v2).toMatchObject({ datation: "PAR_SMS", reference });
    expect(v2.dateReception.toISOString()).toBe("2026-10-18T09:15:00.000Z");
    expect(v1).toMatchObject({ datation: "NON_DATEE", reference: null });

    // Paiement Wave déjà compté (SMS rapproché) : refus précis, jamais rattachable.
    const refCompte = `T${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    await prisma.paiement.create({
      data: { ownerId: A, canal: "WAVE", source: "SMS_WAVE", montant: 2_000, personneId: a.awa.id, statut: "RAPPROCHE", rapprocheLe: new Date(), reference: refCompte, dateReception: new Date() },
    });
    const refus = await daterRepriseAvecSms(verseA.id, undefined, formulaire({ texte: smsReception({ montant: "2.000F", reference: refCompte }) }));
    expect(refus?.conflit).toMatchObject({ rattachable: false });
    expect(refus?.conflit?.message).toContain("rapproché");
  });

  it("dater un versé Orange Money avec le modèle de l'application : chez A seulement", async () => {
    const { daterRepriseDepuisModeleOrangeMoney } = await import("@/app/actions/datation");
    const verseOm = (ownerId: string, personneId: string) =>
      prisma.paiement.create({ data: { ownerId, canal: "ORANGE_MONEY", source: "SAISIE_MANUELLE", montant: 5_000, personneId, origine: "REPRISE_IMPORT", datation: "NON_DATEE", statut: "RAPPROCHE", rapprocheLe: new Date(), dateReception: new Date() } });
    const omA = await verseOm(a.utilisatrice.id, a.awa.id);
    const omB = await verseOm(b.utilisatrice.id, b.awa.id);
    const reference = `PP${Date.now()}.0178.B60701`;
    const texte = ["Orange Money · 5 000 FCFA de Awa", "Date : 18/10/2026 à 01:38", `Référence : ${reference.toLowerCase()}`].join("\n");

    expect(await daterRepriseDepuisModeleOrangeMoney(omB.id, undefined, formulaire({ texte }))).toHaveProperty("erreur");
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: omB.id } })).datation).toBe("NON_DATEE");
    expect(await daterRepriseDepuisModeleOrangeMoney(omA.id, undefined, formulaire({ texte: texte.replace("18/10", "JJ/10") }))).toHaveProperty("erreur");

    expect(await daterRepriseDepuisModeleOrangeMoney(omA.id, undefined, formulaire({ texte }))).toBeUndefined();
    const apres = await prisma.paiement.findUniqueOrThrow({ where: { id: omA.id } });
    expect(apres).toMatchObject({ datation: "PAR_SMS", reference, canal: "ORANGE_MONEY", montant: 5_000 });
    expect(apres.dateReception.toISOString()).toBe("2026-10-18T01:38:00.000Z");
  });

  it("l'API publique de Supabase (clé publique) ne renvoie aucune ligne", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(url && cle).toBeTruthy();
    for (const table of ["utilisatrices", "caisses", "personnes", "paiements", "allocations", "journal_audit", "sms_non_lus", "depenses", "dons"]) {
      const reponse = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: { apikey: cle!, Authorization: `Bearer ${cle}` } });
      const lignes = reponse.ok ? await reponse.json() : [];
      expect(lignes, table).toEqual([]);
    }
  });
});
