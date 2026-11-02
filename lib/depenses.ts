import type { CategorieDepense } from "@/lib/generated/prisma/enums";
import { formaterFCFA } from "@/lib/format";

// Sorties de caisse (phase 11) : restant et totaux par catégorie. Fonctions pures, testées.
// Bonnes volontés : les dons s'ajoutent aux cotisations dans l'encaissé, et paient les dépenses aussi.

export const LIBELLES_CATEGORIE: Record<CategorieDepense, string> = {
  NOURRITURE: "Nourriture",
  TRANSPORT: "Transport",
  MATERIEL: "Matériel",
  LOGEMENT: "Logement",
  COMMUNICATION: "Communication (crédit)",
  AVANCE: "Avance",
  AUTRE: "Autre",
};

export type BilanCaisse = {
  /** Cotisations réparties sur les échéances de la caisse (excédents à rembourser exclus). */
  cotisations: number;
  /** Bonnes volontés (dons) de la collecte. */
  dons: number;
  /** Cotisations + bonnes volontés. */
  encaisse: number;
  depense: number;
  /** Peut être négatif : on dépense plus que ce qui est encaissé (dépassement). */
  restant: number;
  depassement: boolean;
  parCategorie: { categorie: CategorieDepense; total: number; nombre: number }[];
};

/** Bilan d'une collecte : encaissé (cotisations + dons), dépensé, restant ; catégories triées par total décroissant. */
export function bilanCaisse(cotisations: number, depenses: { montant: number; categorie: CategorieDepense }[], dons = 0): BilanCaisse {
  const encaisse = cotisations + dons;
  const depense = depenses.reduce((s, d) => s + d.montant, 0);
  const totaux = new Map<CategorieDepense, { total: number; nombre: number }>();
  for (const d of depenses) {
    const t = totaux.get(d.categorie) ?? { total: 0, nombre: 0 };
    totaux.set(d.categorie, { total: t.total + d.montant, nombre: t.nombre + 1 });
  }
  const parCategorie = [...totaux].map(([categorie, t]) => ({ categorie, ...t })).sort((a, b) => b.total - a.total);
  return { cotisations, dons, encaisse, depense, restant: encaisse - depense, depassement: depense > encaisse, parCategorie };
}

/**
 * Bonnes volontés regroupées par donateur (même nom, casse et espaces ignorés), du plus gros au
 * plus petit ; au-delà de `max`, le reste est réuni en une ligne « N autres ».
 */
export function donsParDonateur(dons: { donateur: string; montant: number }[], max = 4) {
  const totaux = new Map<string, { libelle: string; valeur: number }>();
  for (const d of dons) {
    const cle = d.donateur.trim().replace(/\s+/g, " ").toLowerCase();
    const t = totaux.get(cle) ?? { libelle: d.donateur.trim(), valeur: 0 };
    totaux.set(cle, { ...t, valeur: t.valeur + d.montant });
  }
  const tries = [...totaux.values()].sort((a, b) => b.valeur - a.valeur);
  if (tries.length <= max + 1) return tries;
  const autres = tries.slice(max);
  return [...tries.slice(0, max), { libelle: `${autres.length} autres`, valeur: autres.reduce((s, a) => s + a.valeur, 0) }];
}

/** Lignes ajoutées au récap WhatsApp (choix de la trésorière : total + restant ; détail si des dons). */
export function lignesRecapFinances(bilan: Pick<BilanCaisse, "encaisse" | "depense" | "restant"> & Partial<Pick<BilanCaisse, "cotisations" | "dons">>) {
  return [
    ...(bilan.dons ? [`Cotisations : ${formaterFCFA(bilan.cotisations ?? bilan.encaisse - bilan.dons)}`, `Bonnes volontés : ${formaterFCFA(bilan.dons)}`] : []),
    `Encaissé : ${formaterFCFA(bilan.encaisse)}`,
    `Dépensé : ${formaterFCFA(bilan.depense)}`,
    `Restant : ${formaterFCFA(bilan.restant)}${bilan.restant < 0 ? " (dépassement)" : ""}`,
  ];
}
