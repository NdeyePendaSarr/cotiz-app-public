"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { chercherDoublonsProbables, completerDepuisSms } from "@/lib/capture/doublons";
import { preparerCaptureSms } from "@/lib/capture/sms";
import { CHAMPS_RESUME, paiementsComparables, personnesDuNumero } from "@/lib/donnees/paiements";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { estDansLeFutur, schemaPaiementManuel } from "@/lib/validation/paiement";

/** Paiement tel qu'affiché après une capture (dates en texte : l'état part au navigateur). */
export type ResumePaiement = {
  id: string;
  canal: "WAVE" | "ORANGE_MONEY" | "CASH";
  source: "SMS_WAVE" | "SAISIE_MANUELLE";
  montant: number;
  nomExpediteur: string | null;
  telephoneExpediteur: string | null;
  dateReception: string;
  reference: string | null;
  personne: string | null;
};

type LignePaiement = Omit<ResumePaiement, "dateReception" | "personne"> & {
  dateReception: Date;
  personne: { nomComplet: string } | null;
};

function resumer(p: LignePaiement): ResumePaiement {
  return { ...p, dateReception: p.dateReception.toISOString(), personne: p.personne?.nomComplet ?? null };
}

/** Violation de contrainte unique (même canal + même référence arrivé en même temps). */
const estDoublonEnBase = (e: unknown) => (e as { code?: string })?.code === "P2002";

// ─── Coller un SMS ───────────────────────────────────────────────────────────

export type EtatCaptureSms =
  | {
      texte?: string;
      erreur?: string;
      enregistre?: ResumePaiement & { champsManquants: string[] };
      dejaEnregistre?: ResumePaiement;
      complete?: ResumePaiement & { champs: string[] };
      doublons?: ResumePaiement[];
      nonLu?: boolean;
    }
  | undefined;

/**
 * decision : vide (première tentative), « nouveau » (enregistrer quand même) ou
 * « completer:<id> » (c'est le même paiement : le compléter avec le SMS).
 */
export async function capturerSms(_etat: EtatCaptureSms, formData: FormData): Promise<EtatCaptureSms> {
  const { id: ownerId } = await exigerUtilisatrice();
  const texte = formData.get("texte");
  const decision = String(formData.get("decision") ?? "");
  const prep = preparerCaptureSms(texte);
  const texteSaisi = typeof texte === "string" ? texte : "";

  if (prep.type === "refus") return { texte: texteSaisi, erreur: prep.raison };

  if (prep.type === "non_lu") {
    await prisma.$transaction(async (tx) => {
      const sms = await tx.smsNonLu.create({ data: { ownerId, texteBrut: prep.texteBrut }, select: { id: true } });
      await journaliser(tx, { ownerId, entite: "SmsNonLu", entiteId: sms.id, action: "CREATION", details: { raison: prep.raison } });
    });
    refresh(); // met à jour le compteur « SMS non lus » de la navigation
    return { nonLu: true };
  }

  const d = prep.donnees;
  // 1. Doublon certain : même référence Wave déjà enregistrée.
  if (d.reference) {
    const deja = await prisma.paiement.findFirst({ where: { ownerId, canal: "WAVE", reference: d.reference }, select: CHAMPS_RESUME });
    if (deja) return { dejaEnregistre: resumer(deja) };
  }

  // 2. Doublon probable : même montant, même jour, même numéro ou même personne.
  const probables = chercherDoublonsProbables(
    { canal: "WAVE", montant: d.montant, dateReception: d.dateReception, reference: d.reference, telephoneExpediteur: d.telephoneExpediteur, personneIds: await personnesDuNumero(ownerId, d.telephoneExpediteur) },
    await paiementsComparables(ownerId, "WAVE", d.montant, d.dateReception),
  );

  if (decision.startsWith("completer:")) {
    const cible = probables.find((p) => p.id === decision.slice("completer:".length));
    if (!cible) return { texte: texteSaisi, erreur: "Ce paiement ne correspond plus à ce SMS. Recolle le SMS." };
    const { donnees, champs } = completerDepuisSms(cible, { ...d, texteBrut: prep.texteBrut });
    try {
      const complete = await prisma.$transaction(async (tx) => {
        if (champs.length > 0) {
          await tx.paiement.updateMany({ where: { id: cible.id, ownerId }, data: donnees });
          await journaliser(tx, { ownerId, entite: "Paiement", entiteId: cible.id, action: "COMPLETION", details: { depuis: "SMS", champs, ...donnees } });
        }
        return tx.paiement.findFirstOrThrow({ where: { id: cible.id, ownerId }, select: CHAMPS_RESUME });
      });
      refresh(); // met à jour « Derniers paiements capturés »
      return { complete: { ...resumer(complete), champs } };
    } catch (e) {
      if (estDoublonEnBase(e)) return { texte: texteSaisi, erreur: "Cette référence est déjà enregistrée sur un autre paiement." };
      throw e;
    }
  }

  if (probables.length > 0 && decision !== "nouveau") {
    const details = await prisma.paiement.findMany({ where: { id: { in: probables.map((p) => p.id) }, ownerId }, select: CHAMPS_RESUME });
    return { texte: texteSaisi, doublons: details.map(resumer) };
  }

  // 3. Nouveau paiement, à rapprocher (la personne sera proposée en phase 7).
  try {
    const cree = await prisma.$transaction(async (tx) => {
      const p = await tx.paiement.create({
        data: { ownerId, canal: "WAVE", source: "SMS_WAVE", ...d, texteBrut: prep.texteBrut },
        select: CHAMPS_RESUME,
      });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: p.id, action: "CREATION", details: { source: "SMS_WAVE", montant: d.montant, reference: d.reference } });
      return p;
    });
    refresh();
    return { enregistre: { ...resumer(cree), champsManquants: prep.champsManquants } };
  } catch (e) {
    // Même SMS collé deux fois au même instant : la contrainte unique a refusé le second.
    if (estDoublonEnBase(e) && d.reference) {
      const deja = await prisma.paiement.findFirst({ where: { ownerId, canal: "WAVE", reference: d.reference }, select: CHAMPS_RESUME });
      if (deja) return { dejaEnregistre: resumer(deja) };
    }
    throw e;
  }
}

// ─── Saisie manuelle ─────────────────────────────────────────────────────────

class SmsDejaTraite extends Error {}

const CHAMPS_MANUELS = ["canal", "montant", "date", "heure", "personneId", "reference", "note"] as const;

export type EtatSaisieManuelle =
  | {
      erreur?: string;
      erreurs?: Record<string, string>;
      valeurs?: Record<string, string>;
      enregistre?: ResumePaiement;
      dejaEnregistre?: ResumePaiement;
      doublons?: ResumePaiement[];
    }
  | undefined;

/** smsNonLuId : saisie faite depuis un SMS illisible, marqué traité dans la même transaction. */
export async function saisirPaiement(
  smsNonLuId: string | null,
  _etat: EtatSaisieManuelle,
  formData: FormData,
): Promise<EtatSaisieManuelle> {
  const { id: ownerId } = await exigerUtilisatrice();
  const valeurs: Record<string, string> = {};
  for (const champ of CHAMPS_MANUELS) valeurs[champ] = String(formData.get(champ) ?? "");

  const saisie = schemaPaiementManuel.safeParse(valeurs);
  if (!saisie.success) {
    const erreurs: Record<string, string> = {};
    for (const issue of saisie.error.issues) erreurs[String(issue.path[0])] ??= issue.message;
    return { erreurs, valeurs };
  }
  const p = saisie.data;
  if (estDansLeFutur(p.dateReception)) return { erreurs: { date: "La date et l'heure ne peuvent pas être dans le futur." }, valeurs };

  if (p.personneId && !(await prisma.personne.count({ where: { id: p.personneId, ownerId } }))) {
    return { erreurs: { personneId: "Personne introuvable." }, valeurs };
  }
  let sms: { id: string; texteBrut: string } | null = null;
  if (smsNonLuId) {
    const id = schemaIdentifiant.safeParse(smsNonLuId);
    sms = id.success
      ? await prisma.smsNonLu.findFirst({ where: { id: id.data, ownerId, statut: "A_TRAITER" }, select: { id: true, texteBrut: true } })
      : null;
    if (!sms) return { erreur: "Ce SMS a déjà été traité.", valeurs };
  }

  if (p.reference) {
    const deja = await prisma.paiement.findFirst({ where: { ownerId, canal: p.canal, reference: p.reference }, select: CHAMPS_RESUME });
    if (deja) return { dejaEnregistre: resumer(deja), valeurs };
  }

  if (formData.get("decision") !== "nouveau") {
    const probables = chercherDoublonsProbables(
      { canal: p.canal, montant: p.montant, dateReception: p.dateReception, reference: p.reference, telephoneExpediteur: null, personneIds: p.personneId ? [p.personneId] : [] },
      await paiementsComparables(ownerId, p.canal, p.montant, p.dateReception),
    );
    if (probables.length > 0) {
      const details = await prisma.paiement.findMany({ where: { id: { in: probables.map((x) => x.id) }, ownerId }, select: CHAMPS_RESUME });
      return { doublons: details.map(resumer), valeurs };
    }
  }

  let cree;
  try {
    cree = await prisma.$transaction(async (tx) => {
      const paiement = await tx.paiement.create({
        data: {
          ownerId,
          canal: p.canal,
          source: "SAISIE_MANUELLE",
          montant: p.montant,
          dateReception: p.dateReception,
          personneId: p.personneId,
          reference: p.reference,
          note: p.note,
          texteBrut: sms?.texteBrut ?? null,
        },
        select: CHAMPS_RESUME,
      });
      await journaliser(tx, { ownerId, entite: "Paiement", entiteId: paiement.id, action: "CREATION", details: { source: "SAISIE_MANUELLE", canal: p.canal, montant: p.montant, reference: p.reference } });
      if (sms) {
        // Double envoi : le second trouve le SMS déjà traité, et sa création de paiement est annulée.
        const { count } = await tx.smsNonLu.updateMany({ where: { id: sms.id, ownerId, statut: "A_TRAITER" }, data: { statut: "TRAITE" } });
        if (count === 0) throw new SmsDejaTraite();
        await journaliser(tx, { ownerId, entite: "SmsNonLu", entiteId: sms.id, action: "TRAITEMENT", details: { paiementId: paiement.id } });
      }
      return paiement;
    });
  } catch (e) {
    if (e instanceof SmsDejaTraite) return { erreur: "Ce SMS a déjà été traité.", valeurs };
    if (estDoublonEnBase(e)) return { erreur: "Cette référence vient d'être enregistrée.", valeurs };
    throw e;
  }
  refresh(); // derniers paiements, et compteur « SMS non lus » du layout (conservé par la navigation)
  if (sms) redirect("/sms-non-lus");
  return { enregistre: resumer(cree) };
}

// ─── SMS non lus ─────────────────────────────────────────────────────────────

/** Marque un SMS illisible comme traité sans créer de paiement (ce n'était pas un versement). */
export async function marquerSmsTraite(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("smsId"));
  if (!id.success) return;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.smsNonLu.updateMany({ where: { id: id.data, ownerId, statut: "A_TRAITER" }, data: { statut: "TRAITE" } });
    if (count) await journaliser(tx, { ownerId, entite: "SmsNonLu", entiteId: id.data, action: "TRAITEMENT", details: { sansPaiement: true } });
  });
  await annoncer("SMS écarté");
  refresh();
}
