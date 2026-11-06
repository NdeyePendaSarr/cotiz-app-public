// Compte de démonstration LOCAL (captures d'écran, vidéo) : toutes les données sont inventées.
//   npm run demo:creer      crée le compte « Aïssatou » et ses caisses, et écrit un SMS Wave à coller
//   npm run demo:supprimer  supprime le compte et tout ce qu'il contient
// Refusé si la base ou Supabase ne sont pas locaux : jamais de données de démo en production.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const local = (u: string) => /(127\.0\.0\.1|localhost)[:/]/.test(u);
if (!local(url) || !local(process.env.DATABASE_URL ?? "")) throw new Error("Démo refusée : la base et Supabase doivent être locaux (fichier .env).");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = "demo@cotiz-demo.test";

async function supprimer() {
  const { data } = await admin.auth.admin.listUsers();
  const compte = data.users.find((u) => u.email === email);
  await prisma.utilisatrice.deleteMany({ where: { email } });
  if (compte) await admin.auth.admin.deleteUser(compte.id);
  return Boolean(compte);
}

if (process.argv[2] === "supprimer") {
  console.log((await supprimer()) ? "Compte de démo supprimé." : "Aucun compte de démo.");
  await prisma.$disconnect();
  process.exit(0);
}
await supprimer(); // repartir de zéro à chaque création

// Générateur déterministe : les mêmes captures à chaque fois.
let graine = 42;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const PRENOMS = ["Awa", "Fatou", "Aminata", "Khady", "Mariama", "Coumba", "Ndeye", "Rokhaya", "Binta", "Astou", "Seynabou", "Adama", "Moussa", "Ibrahima", "Cheikh", "Mamadou", "Ousmane", "Abdou", "Modou", "Pape", "Aliou", "Babacar"];
const NOMS = ["Diop", "Ndiaye", "Fall", "Sow", "Ba", "Sarr", "Gueye", "Faye", "Diouf", "Cissé", "Mbaye", "Seck", "Kane", "Thiam", "Niang", "Diallo"];
const JOUR = 86_400_000;
const aujourdhui = new Date(new Date().toISOString().slice(0, 10));
const ilYA = (jours: number, heure = 10) => new Date(aujourdhui.getTime() - jours * JOUR + heure * 3_600_000);
const reference = () => Array.from({ length: 17 }, (_, i) => (i === 0 ? "T" : "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(hasard() * 32)])).join("");

const motDePasse = randomBytes(12).toString("hex");
const { data, error } = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true });
if (error) throw error;
const ownerId = data.user.id;
await prisma.utilisatrice.create({ data: { id: ownerId, email, nom: "Aïssatou" } });

const cellules = ["Organisation", "Technique", "Communication"];
const personnes: { id: string; nom: string; numero: string }[] = [];
const vus = new Set<string>();
for (let i = 0; personnes.length < 40; i++) {
  const nom = `${PRENOMS[Math.floor(hasard() * PRENOMS.length)]} ${NOMS[Math.floor(hasard() * NOMS.length)]}`;
  if (vus.has(nom)) continue;
  vus.add(nom);
  const numero = `770000${String(100 + personnes.length).padStart(3, "0")}`;
  const p = await prisma.personne.create({
    data: { ownerId, nomComplet: nom, cellule: cellules[personnes.length % 3], numeros: { create: { ownerId, numero } } },
    select: { id: true },
  });
  personnes.push({ id: p.id, nom, numero });
}

async function payer(personneIdx: number, echeanceId: string, montant: number, joursAvant: number, canal: "WAVE" | "ORANGE_MONEY" | "CASH" = "WAVE") {
  const p = personnes[personneIdx];
  const paiement = await prisma.paiement.create({
    data: {
      ownerId, canal, source: canal === "WAVE" ? "SMS_WAVE" : "SAISIE_MANUELLE", montant, personneId: p.id, statut: "RAPPROCHE",
      rapprocheLe: ilYA(joursAvant, 20), dateReception: ilYA(joursAvant, 8 + Math.floor(hasard() * 10)),
      ...(canal === "WAVE" && { reference: reference(), nomExpediteur: p.nom.toUpperCase(), telephoneExpediteur: p.numero }),
    },
    select: { id: true },
  });
  await prisma.allocation.create({ data: { paiementId: paiement.id, echeanceId, montant } });
}

// 1. Tontine mensuelle : 10 membres, cycles 1 et 2 clos, cycle 3 en cours.
const tontine = await prisma.caisse.create({ data: { ownerId, nom: "Tontine des amies", type: "TONTINE", montantCotisation: 10_000, frequence: "MENSUELLE", jourEcheance: 15 } });
const membresTontine = [];
for (let i = 0; i < 10; i++) membresTontine.push(await prisma.membreCaisse.create({ data: { caisseId: tontine.id, personneId: personnes[i].id, ordrePassage: i + 1 } }));
for (const [numero, mois, statut] of [[1, -2, "CLOTURE"], [2, -1, "CLOTURE"], [3, 0, "OUVERT"]] as const) {
  const echeance = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() + mois, 15));
  const cycle = await prisma.cycle.create({ data: { caisseId: tontine.id, numero, dateDebut: new Date(echeance.getTime() - 30 * JOUR), dateEcheance: echeance, statut } });
  for (let i = 0; i < 10; i++) {
    const e = await prisma.echeance.create({ data: { cycleId: cycle.id, membreCaisseId: membresTontine[i].id, montantDu: 10_000 } });
    const paye = statut === "CLOTURE" ? (i === 7 && numero === 2 ? 5_000 : 10_000) : i < 6 ? 10_000 : i === 6 ? 5_000 : 0;
    if (paye > 0) await payer(i, e.id, paye, statut === "OUVERT" ? 1 + (i % 9) : 40 * (3 - numero), i % 4 === 3 ? "ORANGE_MONEY" : i % 5 === 4 ? "CASH" : "WAVE");
  }
}

// 2. Collecte du séminaire : 24 membres, en cours, dépenses et bonnes volontés.
const collecte = await prisma.caisse.create({ data: { ownerId, nom: "Séminaire de la commission", type: "COLLECTE", montantCotisation: 5_000, dateLimite: new Date(aujourdhui.getTime() + 20 * JOUR) } });
const cycleCollecte = await prisma.cycle.create({ data: { caisseId: collecte.id, numero: 1, dateDebut: new Date(aujourdhui.getTime() - 25 * JOUR), dateEcheance: new Date(aujourdhui.getTime() + 20 * JOUR) } });
for (let i = 10; i < 34; i++) {
  const m = await prisma.membreCaisse.create({ data: { caisseId: collecte.id, personneId: personnes[i].id } });
  const e = await prisma.echeance.create({ data: { cycleId: cycleCollecte.id, membreCaisseId: m.id, montantDu: 5_000 } });
  const paye = i < 25 ? 5_000 : i < 29 ? 2_500 : 0;
  if (paye > 0) await payer(i, e.id, paye, i % 13, i % 3 === 0 ? "ORANGE_MONEY" : i % 7 === 0 ? "CASH" : "WAVE");
}
for (const [motif, montant, categorie, jours] of [["Location de la salle", 25_000, "LOGEMENT", 6], ["Repas du samedi", 18_500, "NOURRITURE", 3], ["Transport des intervenants", 9_000, "TRANSPORT", 2]] as const) {
  await prisma.depense.create({ data: { ownerId, caisseId: collecte.id, date: new Date(aujourdhui.getTime() - jours * JOUR), montant, motif, canal: "WAVE", categorie } });
}
for (const [donateur, montant] of [["Association des parents", 15_000], ["Mamadou Seck", 5_000]] as const) {
  await prisma.don.create({ data: { ownerId, caisseId: collecte.id, date: new Date(aujourdhui.getTime() - 4 * JOUR), montant, donateur, canal: "WAVE" } });
}

// 3. Mensualité de la cellule : 500 FCFA × 12 mois, au 4e mois ; à jour, en retard, en avance.
const moisDebut = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - 3, 1));
const finMensualite = new Date(Date.UTC(moisDebut.getUTCFullYear(), moisDebut.getUTCMonth() + 12, 0));
const mensualite = await prisma.caisse.create({ data: { ownerId, nom: "Cellule Technique", type: "MENSUALITE", montantCotisation: 500, nombreMois: 12, moisDebut, dateLimite: finMensualite } });
const cycleMensualite = await prisma.cycle.create({ data: { caisseId: mensualite.id, numero: 1, dateDebut: moisDebut, dateEcheance: finMensualite } });
for (const [i, verse] of [[1, 2_000], [4, 1_000], [7, 3_000], [13, 2_000], [16, 500], [19, 2_000], [22, 0], [25, 1_500]] as const) {
  const m = await prisma.membreCaisse.create({ data: { caisseId: mensualite.id, personneId: personnes[i].id } });
  const e = await prisma.echeance.create({ data: { cycleId: cycleMensualite.id, membreCaisseId: m.id, montantDu: 6_000 } });
  if (verse > 0) await payer(i, e.id, verse, 3 + (i % 10));
}

// 4. Compte gardé.
const compte = await prisma.caisse.create({ data: { ownerId, nom: "Épargne de Babacar", type: "COMPTE_GARDE", montantCotisation: 0, membres: { create: { personneId: personnes[35].id } } } });
for (const [jours, montant, sens, note] of [[60, 50_000, "VERSEMENT", "Premier dépôt"], [32, 25_000, "VERSEMENT", null], [12, 15_000, "RETRAIT", "Frais de scolarité"], [5, 20_000, "VERSEMENT", null]] as const) {
  await prisma.mouvementCompte.create({ data: { ownerId, caisseId: compte.id, date: new Date(aujourdhui.getTime() - jours * JOUR), montant, sens, canal: "CASH", note } });
}

// 5. À faire : trois SMS Wave à rapprocher et un SMS illisible.
for (const [i, montant] of [[29, 5_000], [8, 10_000], [30, 2_500]] as const) {
  const p = personnes[i];
  await prisma.paiement.create({
    data: {
      ownerId, canal: "WAVE", source: "SMS_WAVE", montant, dateReception: ilYA(0, 9 + (i % 5)), reference: reference(), nomExpediteur: p.nom.toUpperCase(), telephoneExpediteur: p.numero,
      texteBrut: `Vous avez recu ${montant.toLocaleString("de-DE")}F\nDe ${p.nom.toUpperCase()} (${p.numero})\nle ...`,
    },
  });
}
await prisma.smsNonLu.create({ data: { ownerId, texteBrut: "Votre transfert est en cours de traitement. Merci de patienter." } });

// SMS Wave à coller pendant la vidéo : un membre de la tontine qui n'a rien versé ce cycle paie ses
// 10 000 FCFA. Numéro connu et montant exact : Cotiz le classe « sûr ».
const payeur = personnes[7];
const avant = new Date(Date.now() - 5 * 60_000);
const deux = (n: number) => String(n).padStart(2, "0");
const sms = [
  "Vous avez recu 10.000F",
  `De ${payeur.nom} (${payeur.numero})`,
  `${deux(avant.getUTCDate())}/${deux(avant.getUTCMonth() + 1)}/${avant.getUTCFullYear()} à ${deux(avant.getUTCHours())}h${deux(avant.getUTCMinutes())}`,
  "Nouveau solde: 87.500F",
  "+infos: 200600",
  "Avec WDF",
  reference(),
].join("\n");
writeFileSync("demo-sms.txt", `${sms}\n`);

console.log(`Compte de démo prêt (données inventées).
  E-mail       : ${email}
  Mot de passe : ${motDePasse}
  SMS à coller : fichier demo-sms.txt (${payeur.nom}, 10 000 FCFA)`);
await prisma.$disconnect();
