import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

// Audit, lot 1, sur la base LOCALE : doublon entre saisie manuelle et SMS Wave, datation d'un autre
// montant, bonne volonté figée après un remboursement, doublon d'import versé sur un compte.
// Seule la session est simulée ; Zod, Prisma et la base tournent pour de vrai.

const refus = verifierEnvironnementSeed(process.env);
if (refus) throw new Error(`Test refusé : ${refus}`);

const session = vi.hoisted(() => ({ courante: null as null | { id: string; email: string; nom: string } }));
const annonces = vi.hoisted(() => [] as string[]);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/annonce", () => ({
  annoncer: vi.fn(async (message: string) => {
    annonces.push(message);
  }),
}));
vi.mock("@/lib/auth", () => ({ exigerUtilisatrice: vi.fn(async () => session.courante) }));

const { prisma } = await import("@/lib/prisma");
const { capturerSms, saisirPaiement } = await import("@/app/actions/capture");
const { daterRepriseALaMain, daterRepriseAvecSms, daterRepriseDepuisModeleOrangeMoney } = await import("@/app/actions/datation");
const { modifierDon, supprimerDon } = await import("@/app/actions/dons");
const { ignorerDoublons } = await import("@/app/actions/remboursement");
const { changerStatutCaisse, modifierCaisse } = await import("@/app/actions/caisses");
const { ajouterMembre, changerStatutMembre } = await import("@/app/actions/membres");
const { importerHistoriqueCompte } = await import("@/app/actions/comptes");
const { echeancesDues } = await import("@/lib/donnees/rapprochement");
const { verseDepuis, suiviCaisse } = await import("@/lib/donnees/suivi");

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

const ownerId = randomUUID();
const maintenant = new Date();
const jour = new Date(maintenant.getTime() - 3 * 86_400_000);
const pad = (n: number) => String(n).padStart(2, "0");
const dateIso = jour.toISOString().slice(0, 10);
const dateSms = `${pad(jour.getUTCDate())}/${pad(jour.getUTCMonth() + 1)}/${jour.getUTCFullYear()} à 10h00`;

let personneId = "";
let caisseId = "";

const reprise = (montant: number, canal: "WAVE" | "ORANGE_MONEY" = "WAVE") =>
  prisma.paiement.create({ data: { ownerId, canal, source: "SAISIE_MANUELLE", montant, personneId, origine: "REPRISE_IMPORT", datation: "NON_DATEE", statut: "RAPPROCHE", rapprocheLe: maintenant, dateReception: maintenant } });

const smsIgnore = (montant: number) =>
  prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant, statut: "IGNORE", dateReception: jour } });

beforeAll(async () => {
  session.courante = { id: ownerId, email: `garde-fous-${ownerId.slice(0, 8)}@cotiz.test`, nom: "Garde-fous" };
  await prisma.utilisatrice.create({ data: session.courante });
  personneId = (await prisma.personne.create({ data: { ownerId, nomComplet: "Awa Diallo" } })).id;
  caisseId = (await prisma.caisse.create({ data: { ownerId, nom: "Séminaire", type: "COLLECTE", montantCotisation: 2_000, dateLimite: new Date("2030-01-15") } })).id;
});

afterAll(async () => {
  await prisma.utilisatrice.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe("référence Wave : saisie manuelle puis SMS", () => {
  it("l'ID de l'application saisi à la main et le SMS sont le même paiement", async () => {
    const etat = await saisirPaiement(null, undefined, formulaire({ canal: "WAVE", montant: "5 000", date: dateIso, heure: "10:00", personneId: "", reference: "T_4VKYYABCD-12K7MOX", note: "" }));
    expect(etat?.enregistre).toBeDefined();
    const sms = `Vous avez recu 5.000F\nDe Awa (770000000)\n${dateSms}\nNouveau solde: 9.500F\nT4VKYYABCD12K7MOX`;
    const second = await capturerSms(undefined, formulaire({ texte: sms }));
    expect(second?.dejaEnregistre).toBeDefined();
    expect(await prisma.paiement.count({ where: { ownerId, montant: 5_000 } })).toBe(1);
  });
});

describe("datation : montant identique exigé", () => {
  it("à la main : un SMS d'un autre montant est refusé et reste libre", async () => {
    const verse = await reprise(2_000);
    const sms = await smsIgnore(5_001);
    await daterRepriseALaMain(verse.id, formulaire({ smsId: sms.id }));
    expect(annonces.at(-1)).toContain("ce n'est pas le même argent");
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: sms.id } })).dateRepriseId).toBeNull();
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verse.id } })).datation).toBe("NON_DATEE");
  });

  it("à la main : le même montant passe", async () => {
    const verse = await reprise(3_000);
    const sms = await smsIgnore(3_000);
    await daterRepriseALaMain(verse.id, formulaire({ smsId: sms.id }));
    expect(annonces.at(-1)).toBe("Versé daté ✓");
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: sms.id } })).dateRepriseId).toBe(verse.id);
  });

  it("modèle Orange Money : montant changé refusé, première ligne exigée", async () => {
    const verse = await reprise(4_000, "ORANGE_MONEY");
    const texte = (ligne: string) => [ligne, `Date : ${dateSms}`, `Référence : PP${Date.now()}.0178.B60701`].filter(Boolean).join("\n");
    expect((await daterRepriseDepuisModeleOrangeMoney(verse.id, undefined, formulaire({ texte: texte("Orange Money · 9 000 FCFA de Awa") })))?.erreur).toContain("pas le même argent");
    expect((await daterRepriseDepuisModeleOrangeMoney(verse.id, undefined, formulaire({ texte: texte("") })))?.erreur).toContain("première ligne");
    expect((await daterRepriseDepuisModeleOrangeMoney(verse.id, undefined, formulaire({ texte: "\n".repeat(2_001) })))?.erreur).toContain("Complète");
    expect(await daterRepriseDepuisModeleOrangeMoney(verse.id, undefined, formulaire({ texte: texte("Orange Money · 4 000 FCFA de Awa") }))).toBeUndefined();
  });
});

describe("bonne volonté d'un paiement remboursé", () => {
  const champsDon = (montant: string) => formulaire({ date: dateIso, montant, donateur: "Awa Diallo", remisPar: "", canal: "WAVE", note: "Corrigée" });

  async function paiementAvecDon(rembourseLe: Date | null) {
    const paiement = await prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SAISIE_MANUELLE", montant: 10_000, personneId, statut: "RAPPROCHE", rapprocheLe: maintenant, dateReception: jour, rembourseLe } });
    const don = await prisma.don.create({ data: { ownerId, caisseId, paiementId: paiement.id, date: jour, montant: 2_000, donateur: "Awa Diallo", canal: "WAVE" } });
    return { paiement, don };
  }

  it("montant figé, suppression refusée ; les autres champs restent modifiables", async () => {
    const { don } = await paiementAvecDon(maintenant);
    expect((await modifierDon(don.id, undefined, champsDon("5 000")))?.erreur).toContain("déjà remboursé");
    await supprimerDon(formulaire({ donId: don.id }));
    expect(annonces.at(-1)).toContain("déjà remboursé");
    expect(await prisma.don.findUniqueOrThrow({ where: { id: don.id } })).toMatchObject({ montant: 2_000 });

    await modifierDon(don.id, undefined, champsDon("2 000"));
    expect(await prisma.don.findUniqueOrThrow({ where: { id: don.id } })).toMatchObject({ montant: 2_000, note: "Corrigée" });
  });

  it("sans remboursement : modification et suppression restent libres", async () => {
    const { don } = await paiementAvecDon(null);
    await modifierDon(don.id, undefined, champsDon("3 000"));
    expect((await prisma.don.findUniqueOrThrow({ where: { id: don.id } })).montant).toBe(3_000);
    await supprimerDon(formulaire({ donId: don.id }));
    expect(await prisma.don.count({ where: { id: don.id } })).toBe(0);
  });

  it("le disponible tient compte d'un versement sur un compte gardé", async () => {
    const { paiement, don } = await paiementAvecDon(null);
    const compte = await prisma.caisse.create({ data: { ownerId, nom: "Compte d'Awa", type: "COMPTE_GARDE", montantCotisation: 0 } });
    await prisma.mouvementCompte.create({ data: { ownerId, caisseId: compte.id, sens: "VERSEMENT", montant: 9_000, date: jour, canal: "WAVE", paiementId: paiement.id } });
    expect((await modifierDon(don.id, undefined, champsDon("2 000")))?.erreurs?.montant).toMatch(/1\s000/);
  });
});

describe("ignorerDoublons", () => {
  const smsRapproche = () => prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant: 2_000, personneId, statut: "RAPPROCHE", rapprocheLe: maintenant, dateReception: jour } });

  beforeAll(async () => {
    // La personne a un versé repris sur un cycle ouvert : ses SMS validés sans allocation sont des doublons.
    const cycle = await prisma.cycle.create({ data: { caisseId, numero: 1, dateDebut: jour, dateEcheance: new Date("2030-01-15") } });
    const membre = await prisma.membreCaisse.create({ data: { caisseId, personneId } });
    const echeance = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: 2_000 } });
    const verse = await reprise(2_000);
    await prisma.allocation.create({ data: { paiementId: verse.id, echeanceId: echeance.id, montant: 2_000 } });
  });

  it("un vrai doublon est ignoré ; un paiement versé sur un compte gardé, jamais", async () => {
    const doublon = await smsRapproche();
    await ignorerDoublons(formulaire({ paiementId: doublon.id }));
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: doublon.id } })).statut).toBe("IGNORE");

    const verse = await smsRapproche();
    const compte = await prisma.caisse.findFirstOrThrow({ where: { ownerId, type: "COMPTE_GARDE" } });
    await prisma.mouvementCompte.create({ data: { ownerId, caisseId: compte.id, sens: "VERSEMENT", montant: 2_000, date: jour, canal: "WAVE", paiementId: verse.id } });
    await ignorerDoublons(formulaire({ paiementId: verse.id }));
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verse.id } })).statut).toBe("RAPPROCHE");
  });
});

describe("règles du 05/11/2026", () => {
  const collecte = async (nom: string, montant = 2_000) => {
    const caisse = await prisma.caisse.create({ data: { ownerId, nom, type: "COLLECTE", montantCotisation: montant, dateLimite: new Date("2030-01-15") } });
    const cycle = await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 1, dateDebut: jour, dateEcheance: new Date("2030-01-15") } });
    const personne = await prisma.personne.create({ data: { ownerId, nomComplet: `Membre ${nom}` } });
    const membre = await prisma.membreCaisse.create({ data: { caisseId: caisse.id, personneId: personne.id } });
    const echeance = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membre.id, montantDu: montant } });
    return { caisse, cycle, personne, membre, echeance };
  };
  const verser = async (personneId: string, echeanceId: string, montant: number, total = montant, rembourseLe: Date | null = null) => {
    const p = await prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SAISIE_MANUELLE", montant: total, personneId, statut: "RAPPROCHE", rapprocheLe: maintenant, dateReception: jour, rembourseLe } });
    await prisma.allocation.create({ data: { paiementId: p.id, echeanceId, montant } });
    return p;
  };
  const champsCollecte = (nom: string, montant: string) => formulaire({ type: "COLLECTE", nom, montantCotisation: montant, dateLimite: "2030-01-15" });

  it("caisse archivée : plus proposée au rapprochement ; réactivée : de nouveau proposée", async () => {
    const { caisse, personne } = await collecte("Archivée");
    expect((await echeancesDues(prisma, ownerId, personne.id))[personne.id]).toHaveLength(1);
    await changerStatutCaisse(formulaire({ id: caisse.id, statut: "ARCHIVEE" }));
    expect((await echeancesDues(prisma, ownerId, personne.id))[personne.id]).toBeUndefined();
    await changerStatutCaisse(formulaire({ id: caisse.id, statut: "ACTIVE" }));
    expect((await echeancesDues(prisma, ownerId, personne.id))[personne.id]).toHaveLength(1);
    expect(await prisma.journalAudit.count({ where: { ownerId, entite: "Caisse", entiteId: caisse.id } })).toBe(2);
  });

  it("membre retiré qui doit encore : proposé, et marqué pour ne jamais être « sûr »", async () => {
    const { membre, personne, echeance } = await collecte("Retiré");
    await verser(personne.id, echeance.id, 500);
    await changerStatutMembre(formulaire({ membreId: membre.id, statut: "INACTIF" }));
    expect((await echeancesDues(prisma, ownerId, personne.id))[personne.id]).toEqual([expect.objectContaining({ id: echeance.id, membreRetire: true })]);
    await changerStatutMembre(formulaire({ membreId: membre.id, statut: "ACTIF" }));
    expect(await prisma.journalAudit.count({ where: { ownerId, entite: "MembreCaisse", entiteId: membre.id } })).toBe(2);
  });

  it("arriérés : un membre retiré sans échéance sur le cycle en cours reste compté", async () => {
    const { caisse, cycle, membre } = await collecte("Arriérés");
    await prisma.cycle.update({ where: { id: cycle.id }, data: { statut: "CLOTURE" } });
    await prisma.cycle.create({ data: { caisseId: caisse.id, numero: 2, dateDebut: jour, dateEcheance: new Date("2030-02-15") } });
    await prisma.membreCaisse.update({ where: { id: membre.id }, data: { statut: "INACTIF" } });
    const suivi = await suiviCaisse(ownerId, caisse.id);
    expect(suivi?.lignes).toEqual([]);
    expect(suivi?.totalArrieres).toBe(2_000);
  });

  it("collecte : montant changé pour tout le monde ; refusé sous le versé ; figé une fois terminée", async () => {
    const { caisse, personne, echeance, cycle } = await collecte("Montant");
    await verser(personne.id, echeance.id, 1_500);
    expect((await modifierCaisse(caisse.id, undefined, champsCollecte("Montant", "1 000")))?.erreur).toContain(personne.nomComplet);
    expect((await prisma.echeance.findUniqueOrThrow({ where: { id: echeance.id } })).montantDu).toBe(2_000);

    await modifierCaisse(caisse.id, undefined, champsCollecte("Montant", "3 000"));
    expect((await prisma.echeance.findUniqueOrThrow({ where: { id: echeance.id } })).montantDu).toBe(3_000);
    const journal = await prisma.journalAudit.findFirstOrThrow({ where: { ownerId, entite: "Caisse", entiteId: caisse.id, action: "MODIFICATION" }, orderBy: { id: "desc" } });
    expect(journal.details).toMatchObject({ avant: { montantDu: 2_000 }, apres: { montantDu: 3_000 } });

    await prisma.cycle.update({ where: { id: cycle.id }, data: { statut: "CLOTURE" } });
    expect((await modifierCaisse(caisse.id, undefined, champsCollecte("Montant", "4 000")))?.erreur).toContain("terminée");
  });

  it("« Versé dans l'année » : net de l'excédent remboursé", async () => {
    const { personne, echeance } = await collecte("Net");
    await verser(personne.id, echeance.id, 2_000, 5_000, maintenant);
    expect(await verseDepuis(ownerId, personne.id, new Date(jour.getTime() - 86_400_000))).toBe(2_000);
  });

  it("inscription journalisée", async () => {
    const { caisse } = await collecte("Inscription");
    const nouvelle = await prisma.personne.create({ data: { ownerId, nomComplet: "Nouvelle inscrite" } });
    await ajouterMembre(formulaire({ caisseId: caisse.id, personneId: nouvelle.id }));
    const membre = await prisma.membreCaisse.findFirstOrThrow({ where: { caisseId: caisse.id, personneId: nouvelle.id } });
    expect(await prisma.journalAudit.count({ where: { ownerId, entite: "MembreCaisse", entiteId: membre.id, action: "CREATION" } })).toBe(1);
  });
});

describe("cas rares", () => {
  it("SMS non lu traité deux fois : un seul paiement", async () => {
    const sms = await prisma.smsNonLu.create({ data: { ownerId, texteBrut: "Texte illisible" } });
    const envoyer = () => saisirPaiement(sms.id, undefined, formulaire({ canal: "CASH", montant: "7 777", date: dateIso, heure: "10:00", personneId: "", reference: "", note: "", decision: "nouveau" }));
    const resultats = await Promise.allSettled([envoyer(), envoyer()]);
    expect(resultats.every((r) => r.status === "fulfilled" || String(r.reason).includes("REDIRECT"))).toBe(true);
    expect(await prisma.paiement.count({ where: { ownerId, montant: 7_777 } })).toBe(1);
  });

  it("historique d'un compte envoyé deux fois en même temps : aucun doublon", async () => {
    const compte = await prisma.caisse.create({ data: { ownerId, nom: "Compte double envoi", type: "COMPTE_GARDE", montantCotisation: 0 } });
    const texte = "Date\tVersement\tRetrait\n01/01/2026\t1 000\t\n01/01/2026\t1 000\t\n02/01/2026\t\t500";
    const envoyer = () => importerHistoriqueCompte(compte.id, undefined, formulaire({ texte, canal: "CASH", intention: "importer" }));
    await Promise.all([envoyer(), envoyer()]);
    expect(await prisma.mouvementCompte.count({ where: { caisseId: compte.id } })).toBe(3);
  });

  it("rattacher un SMS d'une somme à un autre versé : l'autre SMS redevient libre", async () => {
    const verse = await reprise(6_000);
    const autre = await reprise(4_000);
    const reference = `T${Date.now()}ABCDEF`.slice(0, 17).toUpperCase();
    const smsA = await prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant: 4_000, statut: "IGNORE", dateReception: jour, reference, dateRepriseId: verse.id } });
    const smsB = await prisma.paiement.create({ data: { ownerId, canal: "WAVE", source: "SMS_WAVE", montant: 2_000, statut: "IGNORE", dateReception: jour, dateRepriseId: verse.id } });
    await prisma.paiement.update({ where: { id: verse.id }, data: { datation: "PAR_SMS", dateReception: jour } });

    const sms = `Vous avez recu 4.000F\nDe Awa (770000000)\n${dateSms}\n${reference}`;
    expect(await daterRepriseAvecSms(autre.id, undefined, formulaire({ texte: sms, rattacher: "1" }))).toBeUndefined();
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: smsA.id } })).dateRepriseId).toBe(autre.id);
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: smsB.id } })).dateRepriseId).toBeNull();
    expect((await prisma.paiement.findUniqueOrThrow({ where: { id: verse.id } })).datation).toBe("NON_DATEE");
  });
});
