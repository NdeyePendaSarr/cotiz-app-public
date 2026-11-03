"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { journaliser } from "@/lib/audit";
import { annoncer } from "@/lib/annonce";
import { exigerUtilisatrice } from "@/lib/auth";
import { analyserHistoriqueCompte, cleMouvement, type Sens } from "@/lib/comptes";
import { aujourdhui } from "@/lib/cycles/dates";
import { Canal } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { lireFormulaireMouvement, schemaMouvement, type DonneesMouvement } from "@/lib/validation/mouvement";

// Comptes gardés : versements et retraits saisis à la main, modifiés, supprimés ou importés d'un
// historique collé. Toujours filtrés par ownerId, journalisés dans la même transaction. Un versement
// venu d'un paiement rapproché (paiementId) ne se modifie pas ici : on annule son rapprochement.

export type EtatFormulaireMouvement =
  | { erreur?: string; erreurs?: Record<string, string>; valeurs?: ReturnType<typeof lireFormulaireMouvement> }
  | undefined;

function erreursParChamp(erreur: z.ZodError) {
  const erreurs: Record<string, string> = {};
  for (const issue of erreur.issues) erreurs[issue.path.join(".") || "formulaire"] ??= issue.message;
  return erreurs;
}

/** Valide la saisie ; une date dans le futur est une erreur de frappe. */
function lireSaisie(formData: FormData): { donnees: DonneesMouvement } | { etat: EtatFormulaireMouvement } {
  const valeurs = lireFormulaireMouvement(formData);
  const saisie = schemaMouvement.safeParse(valeurs);
  if (!saisie.success) return { etat: { erreurs: erreursParChamp(saisie.error), valeurs } };
  if (saisie.data.date > aujourdhui()) return { etat: { erreurs: { date: "La date ne peut pas être dans le futur." }, valeurs } };
  return { donnees: saisie.data };
}

const resumer = (d: DonneesMouvement) => ({ ...d, date: d.date.toISOString().slice(0, 10) });
const versCompte = (caisseId: string) => `/caisses/${caisseId}`;
const libelle = (sens: Sens) => (sens === "VERSEMENT" ? "Versement" : "Retrait");

export async function creerMouvement(caisseId: string, _etat: EtatFormulaireMouvement, formData: FormData): Promise<EtatFormulaireMouvement> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Compte introuvable." };
  const compte = await prisma.caisse.findFirst({ where: { id: idValide.data, ownerId, type: "COMPTE_GARDE", statut: "ACTIVE" }, select: { id: true } });
  if (!compte) return { erreur: "Compte introuvable ou archivé." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  await prisma.$transaction(async (tx) => {
    const m = await tx.mouvementCompte.create({ data: { ownerId, caisseId: compte.id, ...lu.donnees }, select: { id: true } });
    await journaliser(tx, { ownerId, entite: "MouvementCompte", entiteId: m.id, action: "CREATION", details: resumer(lu.donnees) });
  });
  await annoncer(`${libelle(lu.donnees.sens)} enregistré ✓`);
  refresh();
  redirect(versCompte(compte.id));
}

export async function modifierMouvement(id: string, _etat: EtatFormulaireMouvement, formData: FormData): Promise<EtatFormulaireMouvement> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) return { erreur: "Mouvement introuvable." };

  const lu = lireSaisie(formData);
  if ("etat" in lu) return lu.etat;

  const resultat = await prisma.$transaction(async (tx) => {
    const avant = await tx.mouvementCompte.findFirst({
      where: { id: idValide.data, ownerId },
      select: { caisseId: true, date: true, montant: true, sens: true, canal: true, note: true, paiementId: true },
    });
    if (!avant) return { erreur: "Mouvement introuvable." };
    if (avant.paiementId) return { erreur: "Ce versement vient d'un paiement rapproché : pour le changer, annule son rapprochement." };
    await tx.mouvementCompte.updateMany({ where: { id: idValide.data, ownerId }, data: lu.donnees });
    const anciennes = { date: avant.date, montant: avant.montant, sens: avant.sens, canal: avant.canal, note: avant.note };
    await journaliser(tx, { ownerId, entite: "MouvementCompte", entiteId: idValide.data, action: "MODIFICATION", details: { avant: resumer(anciennes), apres: resumer(lu.donnees) } });
    return { caisseId: avant.caisseId };
  });
  if ("erreur" in resultat) return { erreur: resultat.erreur };
  await annoncer("Mouvement modifié ✓");
  refresh();
  redirect(versCompte(resultat.caisseId));
}

export async function supprimerMouvement(formData: FormData) {
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(formData.get("mouvementId"));
  if (!id.success) return;

  const caisseId = await prisma.$transaction(async (tx) => {
    const m = await tx.mouvementCompte.findFirst({
      where: { id: id.data, ownerId, paiementId: null },
      select: { caisseId: true, date: true, montant: true, sens: true, canal: true, note: true },
    });
    if (!m) return null;
    await tx.mouvementCompte.deleteMany({ where: { id: id.data, ownerId } });
    const { caisseId: compte, ...supprime } = m;
    await journaliser(tx, { ownerId, entite: "MouvementCompte", entiteId: id.data, action: "SUPPRESSION", details: resumer(supprime) });
    return compte;
  });
  if (!caisseId) return;
  await annoncer("Mouvement supprimé");
  refresh();
  redirect(versCompte(caisseId));
}

// ─── Import d'un historique collé ────────────────────────────────────────────────

export type LigneApercuCompte = {
  numero: number;
  texte: string;
  date: string | null;
  sens: Sens | null;
  montant: number | null;
  canal: Canal | null;
  note: string | null;
  erreur: string | null;
  /** Déjà dans Cotiz (même jour, même sens, même montant) : ignoré, jamais compté deux fois. */
  dejaEnregistre: boolean;
};

export type EtatImportCompte =
  | {
      erreur?: string;
      apercu?: { lignes: LigneApercuCompte[]; aImporter: number; versements: number; retraits: number; sansCanal: number; canal: Canal | null };
      termine?: { importes: number; versements: number; retraits: number };
    }
  | undefined;

/**
 * Import d'un historique (Word, Excel) : « analyser » montre l'aperçu, « importer » enregistre.
 * L'analyse est refaite côté serveur ; les lignes en erreur et celles déjà enregistrées sont ignorées.
 */
export async function importerHistoriqueCompte(caisseId: string, _etat: EtatImportCompte, formData: FormData): Promise<EtatImportCompte> {
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(caisseId);
  if (!idValide.success) return { erreur: "Compte introuvable." };
  const compte = await prisma.caisse.findFirst({ where: { id: idValide.data, ownerId, type: "COMPTE_GARDE", statut: "ACTIVE" }, select: { id: true } });
  if (!compte) return { erreur: "Compte introuvable ou archivé." };

  const texte = z.string().max(100_000).safeParse(formData.get("texte"));
  if (!texte.success || !texte.data.trim()) return { erreur: "Colle d'abord ton tableau." };
  const canalChoisi = z.enum(Canal).safeParse(formData.get("canal"));
  const canal = canalChoisi.success ? canalChoisi.data : null;

  const analyse = analyserHistoriqueCompte(texte.data);
  // Doublons : chaque mouvement déjà enregistré « consomme » une ligne identique du tableau.
  const existants = await prisma.mouvementCompte.findMany({ where: { ownerId, caisseId: compte.id }, select: { date: true, sens: true, montant: true } });
  const restants = new Map<string, number>();
  for (const m of existants) restants.set(cleMouvement(m), (restants.get(cleMouvement(m)) ?? 0) + 1);
  const lignes: LigneApercuCompte[] = analyse.lignes.map((l) => {
    let dejaEnregistre = false;
    if (!l.erreur && l.date && l.sens && l.montant) {
      const cle = cleMouvement({ date: l.date, sens: l.sens, montant: l.montant });
      const n = restants.get(cle) ?? 0;
      if (n > 0) {
        dejaEnregistre = true;
        restants.set(cle, n - 1);
      }
    }
    return { ...l, date: l.date ? l.date.toISOString().slice(0, 10) : null, dejaEnregistre };
  });
  const aImporter = lignes.filter((l) => !l.erreur && !l.dejaEnregistre);
  const apercu = {
    lignes,
    aImporter: aImporter.length,
    versements: aImporter.filter((l) => l.sens === "VERSEMENT").reduce((s, l) => s + (l.montant ?? 0), 0),
    retraits: aImporter.filter((l) => l.sens === "RETRAIT").reduce((s, l) => s + (l.montant ?? 0), 0),
    sansCanal: aImporter.filter((l) => !l.canal).length,
    canal,
  };

  if (formData.get("intention") !== "importer") return { apercu };
  if (aImporter.length === 0) return { apercu, erreur: "Aucune ligne à importer." };
  if (apercu.sansCanal > 0 && !canal) return { apercu, erreur: "Choisis le canal des lignes qui n'en ont pas." };
  if (aImporter.some((l) => l.date && l.date > aujourdhui().toISOString().slice(0, 10))) return { apercu, erreur: "Une date est dans le futur : corrige le tableau." };

  await prisma.$transaction(
    async (tx) => {
      for (const l of aImporter) {
        const donnees = { date: new Date(`${l.date}T00:00:00.000Z`), montant: l.montant!, sens: l.sens!, canal: (l.canal ?? canal)!, note: l.note };
        const m = await tx.mouvementCompte.create({ data: { ownerId, caisseId: compte.id, ...donnees }, select: { id: true } });
        await journaliser(tx, { ownerId, entite: "MouvementCompte", entiteId: m.id, action: "CREATION", details: { ...resumer(donnees), source: "IMPORT" } });
      }
    },
    { timeout: 30_000 },
  );
  await annoncer(`${aImporter.length} mouvement${aImporter.length > 1 ? "s" : ""} importé${aImporter.length > 1 ? "s" : ""} ✓`);
  refresh();
  return { termine: { importes: aImporter.length, versements: apercu.versements, retraits: apercu.retraits } };
}
