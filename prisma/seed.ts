// Seed de démo Cotiz : données entièrement fictives. DÉVELOPPEMENT LOCAL UNIQUEMENT.
// Lancement : `npx prisma db seed` (déclaré dans prisma.config.ts). Node charge .env
// avant tout le reste grâce à l'option --env-file-if-exists de cette commande.
// Le compte de démo (Supabase Auth local) est créé s'il n'existe pas.
//
// Contenu : 1 trésorière, 3 caisses de 32 membres (tontine mensuelle, tontine
// hebdomadaire, collecte), 6 personnes partagées entre 2 caisses (90 personnes),
// 1 cycle ouvert par caisse avec ses échéances, 15 paiements dont 5 à rapprocher
// et 1 qui couvre 2 caisses.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prochaineEcheanceHebdomadaire, prochaineEcheanceMensuelle } from "../lib/cycles/dates";
import { prisma } from "../lib/prisma";
import { verifierEnvironnementSeed } from "../lib/seed/garde-fous";
import { Canal, Frequence, Source, StatutPaiement, TypeCaisse } from "../lib/generated/prisma/client";

// ─── Garde-fous ──────────────────────────────────────────────────────────────
// Base ET API Supabase doivent être locales : le seed efface des données et utilise la
// clé d'administration. (L'import de lib/prisma ci-dessus ne se connecte pas encore.)

const refus = verifierEnvironnementSeed(process.env);
if (refus) {
  console.error(`✋ Seed refusé : ${refus}`);
  process.exit(1);
}

const NOM_DEMO = "Trésorière démo (seed)";
const email = process.env.SEED_UTILISATRICE_EMAIL || "demo@cotiz.test";

/** Compte de démo dans Supabase Auth local : retrouvé par son e-mail, ou créé. Renvoie son id. */
async function assurerCompteDemo() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const motDePasse = process.env.SEED_UTILISATRICE_MOT_DE_PASSE;
  if (!cle || !motDePasse) throw new Error("SUPABASE_SERVICE_ROLE_KEY et SEED_UTILISATRICE_MOT_DE_PASSE sont requis (voir .env.example).");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, cle, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existant = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existant) return existant.id;

  const cree = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true });
  if (cree.error) throw cree.error;
  console.log(`Compte de démo créé : ${email}`);
  return cree.data.user.id;
}

// ─── Générateurs déterministes (mêmes données à chaque exécution) ────────────

const PRENOMS = [
  "Aminata", "Moussa", "Fatou", "Ibrahima", "Awa", "Cheikh", "Mariama", "Ousmane", "Khady", "Mamadou",
  "Ndeye", "Abdoulaye", "Aïssatou", "Modou", "Coumba", "Babacar", "Seynabou", "Pape", "Rokhaya", "Alioune",
  "Dieynaba", "Serigne", "Astou", "Lamine", "Binta", "Souleymane", "Mame Diarra", "Assane", "Yacine", "El Hadji",
];
const NOMS = [
  "Ndiaye", "Diop", "Fall", "Sow", "Ba", "Gueye", "Faye", "Sarr", "Diallo",
  "Mbaye", "Cissé", "Thiam", "Seck", "Ndoye", "Kane", "Diouf", "Sy",
];
const PREFIXES = ["77", "78", "76", "70"];

// (i % 30, i*7 % 17) est unique pour i < 510 : pas d'homonymes exacts.
const nomPersonne = (i: number) => `${PRENOMS[i % PRENOMS.length]} ${NOMS[(i * 7) % NOMS.length]}`;
// Alias Wave : même prénom, autre nom de famille (ex. nom d'épouse utilisé dans Wave).
const aliasPersonne = (i: number) => `${PRENOMS[i % PRENOMS.length]} ${NOMS[(i * 7 + 3) % NOMS.length]}`;
// 9 chiffres, sans indicatif. 7919 est premier avec 9 000 000 : numéros tous différents.
const numeroPersonne = (i: number) => PREFIXES[i % 4] + String(1_000_000 + ((i * 7919) % 9_000_000));
// Référence Wave fictive : 17 caractères, majuscules et chiffres.
const referenceWave = (n: number) => `SEED${String(n).padStart(3, "0")}T4VKYYABCD`;

const jours = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const ilYa = (j: number, heure: number) => {
  const d = jours(-j);
  d.setUTCHours(heure, 7); // Dakar = UTC+0
  return d;
};

// Texte d'un SMS Wave de réception. La ligne « Nouveau solde » est volontairement
// absente : le solde ne doit jamais être stocké (voir la question posée en phase 1).
const smsWave = (montant: number, nom: string, tel: string, date: Date, ref: string) => {
  const m = montant.toLocaleString("de-DE"); // 25000 → « 25.000 », comme Wave
  const jj = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `Vous avez recu ${m}F\nDe ${nom} (${tel})\n${jj}/${mm}/${date.getUTCFullYear()} à ${hh}h${mi}\n+infos: 200600\nAvec WDF\n${ref}`;
};

// ─── Seed ────────────────────────────────────────────────────────────────────

async function main() {
  const ownerId = await assurerCompteDemo();
  const existante = await prisma.utilisatrice.findUnique({ where: { id: ownerId } });
  if (existante && existante.nom !== NOM_DEMO) {
    // Protège un vrai compte : on n'efface jamais les données d'une utilisatrice
    // qui n'a pas été créée par ce seed.
    throw new Error(`L'utilisatrice ${ownerId} n'est pas le compte de démo (nom « ${existante.nom} ») : seed annulé.`);
  }

  await prisma.$transaction(
    async (tx) => {
      // 1. Remise à zéro : uniquement les données de la trésorière de démo.
      //    Les suppressions en cascade retirent membres, cycles, échéances et allocations.
      //    Mouvements, bonnes volontés et dépenses d'abord : ils protègent leur caisse.
      await tx.mouvementCompte.deleteMany({ where: { ownerId } });
      await tx.don.deleteMany({ where: { ownerId } });
      await tx.depense.deleteMany({ where: { ownerId } });
      await tx.paiement.deleteMany({ where: { ownerId } });
      await tx.caisse.deleteMany({ where: { ownerId } });
      await tx.personne.deleteMany({ where: { ownerId } });
      await tx.journalAudit.deleteMany({ where: { ownerId } });
      await tx.smsNonLu.deleteMany({ where: { ownerId } });
      await tx.utilisatrice.upsert({
        where: { id: ownerId },
        create: { id: ownerId, email, nom: NOM_DEMO },
        update: { email },
      });

      // 2. Caisses
      const caisses = [
        { id: randomUUID(), ownerId, nom: "Tontine mensuelle des amies", montantCotisation: 10_000,
          type: TypeCaisse.TONTINE, frequence: Frequence.MENSUELLE, jourEcheance: 5 },
        { id: randomUUID(), ownerId, nom: "Tontine hebdo du marché", montantCotisation: 2_000,
          type: TypeCaisse.TONTINE, frequence: Frequence.HEBDOMADAIRE, jourEcheance: 6 }, // 6 = samedi (ISO)
        { id: randomUUID(), ownerId, nom: "Collecte séminaire de décembre", montantCotisation: 5_000,
          type: TypeCaisse.COLLECTE, dateLimite: jours(15) },
      ];
      await tx.caisse.createMany({ data: caisses });
      const [mensuelle, hebdo, collecte] = caisses;

      // 3. Personnes : 90 au total, dont 6 partagées (indices 0 à 5).
      const personnes = Array.from({ length: 90 }, (_, i) => ({
        id: randomUUID(),
        ownerId,
        nomComplet: nomPersonne(i),
        // Une personne sur 5 a un alias Wave (nom écrit autrement dans l'app Wave).
        aliasWave: i % 5 === 0 ? [aliasPersonne(i)] : [],
      }));
      await tx.personne.createMany({ data: personnes });

      const numeros: Array<{ ownerId: string; personneId: string; numero: string; libelle?: string }> =
        personnes.map((p, i) => ({ ownerId, personneId: p.id, numero: numeroPersonne(i) }));
      // Le mari de la personne 0 paie parfois pour elle depuis son numéro.
      numeros.push({ ownerId, personneId: personnes[0].id, numero: numeroPersonne(500), libelle: "numéro du mari" });
      await tx.numeroPersonne.createMany({ data: numeros });

      // 4. Membres : chaque caisse a 32 membres.
      //    Partagées : 0-1 mensuelle+hebdo, 2-3 mensuelle+collecte, 4-5 hebdo+collecte.
      //    Ensuite 28 personnes propres à chaque caisse : 6-33, 34-61, 62-89.
      const indicesParCaisse = [
        [0, 1, 2, 3, ...range(6, 34)],
        [0, 1, 4, 5, ...range(34, 62)],
        [2, 3, 4, 5, ...range(62, 90)],
      ];
      const membres = caisses.flatMap((c, k) =>
        indicesParCaisse[k].map((i, rang) => ({
          id: randomUUID(),
          caisseId: c.id,
          personneId: personnes[i].id,
          ordrePassage: c.type === TypeCaisse.TONTINE ? rang + 1 : null,
        })),
      );
      await tx.membreCaisse.createMany({ data: membres });

      // 5. Un cycle ouvert par caisse, et une échéance par membre actif.
      // Dates calculées comme dans l'application (lib/cycles/dates.ts) : échéance = prochain
      // jour d'échéance à partir du début du cycle ; collecte = sa date limite.
      const cycles = [
        { id: randomUUID(), caisseId: mensuelle.id, numero: 1, dateDebut: jours(-20), dateEcheance: prochaineEcheanceMensuelle(jours(-20), 5) },
        { id: randomUUID(), caisseId: hebdo.id, numero: 1, dateDebut: jours(-3), dateEcheance: prochaineEcheanceHebdomadaire(jours(-3), 6) },
        { id: randomUUID(), caisseId: collecte.id, numero: 1, dateDebut: jours(-15), dateEcheance: collecte.dateLimite as Date },
      ];
      await tx.cycle.createMany({ data: cycles });

      const echeances = membres.map((m) => {
        const k = caisses.findIndex((c) => c.id === m.caisseId);
        return { id: randomUUID(), cycleId: cycles[k].id, membreCaisseId: m.id, montantDu: caisses[k].montantCotisation };
      });
      await tx.echeance.createMany({ data: echeances });

      // Échéance d'une personne (indice) dans une caisse (0, 1 ou 2).
      const echeanceDe = (i: number, k: number) => {
        const membre = membres.find((m) => m.caisseId === caisses[k].id && m.personneId === personnes[i].id);
        const e = echeances.find((x) => x.membreCaisseId === membre?.id);
        if (!e) throw new Error(`Personne ${i} absente de la caisse ${k}`);
        return e.id;
      };

      // 6. Paiements : 10 rapprochés (avec allocations), 5 à rapprocher.
      type Alloc = { echeanceId: string; montant: number };
      const paiements: Array<{ i: number | null; canal: Canal; montant: number; jour: number; allocs: Alloc[]; nomWave?: string; tel?: string }> = [
        // Paiement unique qui couvre 2 caisses : personne 0 (mensuelle 10 000 + hebdo 2 000).
        { i: 0, canal: Canal.WAVE, montant: 12_000, jour: 2, allocs: [
          { echeanceId: echeanceDe(0, 0), montant: 10_000 }, { echeanceId: echeanceDe(0, 1), montant: 2_000 }] },
        { i: 6, canal: Canal.WAVE, montant: 10_000, jour: 5, allocs: [{ echeanceId: echeanceDe(6, 0), montant: 10_000 }] },
        { i: 7, canal: Canal.WAVE, montant: 10_000, jour: 4, allocs: [{ echeanceId: echeanceDe(7, 0), montant: 10_000 }] },
        // Excédent : 12 000 versés pour 10 000 dus → 2 000 « à rembourser » (calculé).
        { i: 8, canal: Canal.WAVE, montant: 12_000, jour: 4, allocs: [{ echeanceId: echeanceDe(8, 0), montant: 10_000 }] },
        { i: 9, canal: Canal.ORANGE_MONEY, montant: 10_000, jour: 3, allocs: [{ echeanceId: echeanceDe(9, 0), montant: 10_000 }] },
        { i: 34, canal: Canal.WAVE, montant: 2_000, jour: 2, allocs: [{ echeanceId: echeanceDe(34, 1), montant: 2_000 }] },
        // Partiel : 1 000 sur 2 000.
        { i: 35, canal: Canal.CASH, montant: 1_000, jour: 1, allocs: [{ echeanceId: echeanceDe(35, 1), montant: 1_000 }] },
        // Collecte payée en 2 tranches par la personne 62.
        { i: 62, canal: Canal.WAVE, montant: 2_500, jour: 10, allocs: [{ echeanceId: echeanceDe(62, 2), montant: 2_500 }] },
        { i: 62, canal: Canal.WAVE, montant: 2_500, jour: 3, allocs: [{ echeanceId: echeanceDe(62, 2), montant: 2_500 }] },
        { i: 63, canal: Canal.WAVE, montant: 5_000, jour: 6, allocs: [{ echeanceId: echeanceDe(63, 2), montant: 5_000 }] },

        // À rapprocher (personne non encore identifiée : personneId reste null).
        { i: null, canal: Canal.WAVE, montant: 10_000, jour: 1, allocs: [], nomWave: nomPersonne(10), tel: numeroPersonne(10) }, // numéro connu
        { i: null, canal: Canal.WAVE, montant: 2_000, jour: 1, allocs: [], nomWave: aliasPersonne(40).toLowerCase(), tel: "771112233" }, // alias connu (en minuscules), numéro inconnu
        { i: null, canal: Canal.WAVE, montant: 4_000, jour: 0, allocs: [], nomWave: "Mor Talla Ndour", tel: "781234500" }, // inconnu
        { i: null, canal: Canal.WAVE, montant: 2_000, jour: 0, allocs: [], nomWave: "Omar Ndiaye", tel: numeroPersonne(500) }, // numéro du mari de la personne 0
        { i: null, canal: Canal.ORANGE_MONEY, montant: 5_000, jour: 0, allocs: [] }, // saisie manuelle OM
      ];

      for (const [n, p] of paiements.entries()) {
        const date = ilYa(p.jour, 9 + (n % 10));
        const parSms = p.canal === Canal.WAVE;
        const nom = p.nomWave ?? (p.i !== null ? nomPersonne(p.i) : null);
        const tel = p.tel ?? (p.i !== null ? numeroPersonne(p.i) : null);
        const reference = parSms ? referenceWave(n + 1) : null;

        await tx.paiement.create({
          data: {
            ownerId,
            personneId: p.i !== null ? personnes[p.i].id : null,
            canal: p.canal,
            source: parSms ? Source.SMS_WAVE : Source.SAISIE_MANUELLE,
            montant: p.montant,
            nomExpediteur: parSms ? nom : null,
            telephoneExpediteur: parSms ? tel : null,
            reference,
            dateReception: date,
            texteBrut: parSms && nom && tel && reference ? smsWave(p.montant, nom, tel, date, reference) : null,
            statut: p.allocs.length > 0 ? StatutPaiement.RAPPROCHE : StatutPaiement.A_RAPPROCHER,
            allocations: { create: p.allocs },
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  const [nbPersonnes, nbMembres, nbEcheances, nbPaiements, nbARapprocher] = await Promise.all([
    prisma.personne.count({ where: { ownerId } }),
    prisma.membreCaisse.count({ where: { caisse: { ownerId } } }),
    prisma.echeance.count({ where: { cycle: { caisse: { ownerId } } } }),
    prisma.paiement.count({ where: { ownerId } }),
    prisma.paiement.count({ where: { ownerId, statut: StatutPaiement.A_RAPPROCHER } }),
  ]);
  console.log(
    `✅ Seed terminé pour ${email} : ${nbPersonnes} personnes, ${nbMembres} membres, ` +
      `${nbEcheances} échéances, ${nbPaiements} paiements (${nbARapprocher} à rapprocher).`,
  );
}

function range(debut: number, fin: number) {
  return Array.from({ length: fin - debut }, (_, k) => debut + k);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
