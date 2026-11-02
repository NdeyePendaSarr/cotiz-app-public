import { describe, expect, it } from "vitest";
import { bilanCaisse, donsParDonateur, lignesRecapFinances } from "@/lib/depenses";
import { formaterFCFA } from "@/lib/format";
import { lireFormulaireDepense, schemaDepense } from "@/lib/validation/depense";

// Phase 11 : sorties de caisse d'une collecte.

describe("bilanCaisse", () => {
  const depenses = [
    { montant: 20_000, categorie: "NOURRITURE" as const },
    { montant: 5_000, categorie: "TRANSPORT" as const },
    { montant: 3_000, categorie: "MATERIEL" as const },
    { montant: 10_000, categorie: "NOURRITURE" as const },
  ];

  it("encaissé − dépensé = restant ; catégories triées par total", () => {
    expect(bilanCaisse(66_000, depenses)).toEqual({
      cotisations: 66_000,
      dons: 0,
      encaisse: 66_000,
      depense: 38_000,
      restant: 28_000,
      depassement: false,
      parCategorie: [
        { categorie: "NOURRITURE", total: 30_000, nombre: 2 },
        { categorie: "TRANSPORT", total: 5_000, nombre: 1 },
        { categorie: "MATERIEL", total: 3_000, nombre: 1 },
      ],
    });
  });

  it("dépassement : restant négatif, autorisé et signalé", () => {
    expect(bilanCaisse(10_000, depenses)).toMatchObject({ restant: -28_000, depassement: true });
  });

  it("sans dépense : tout l'encaissé reste", () => {
    expect(bilanCaisse(66_000, [])).toEqual({ cotisations: 66_000, dons: 0, encaisse: 66_000, depense: 0, restant: 66_000, depassement: false, parCategorie: [] });
  });

  it("bonnes volontés : ajoutées à l'encaissé, elles paient aussi les dépenses", () => {
    expect(bilanCaisse(10_000, depenses, 33_000)).toMatchObject({ cotisations: 10_000, dons: 33_000, encaisse: 43_000, restant: 5_000, depassement: false });
  });
});

describe("lignesRecapFinances (récap WhatsApp)", () => {
  it("total encaissé, dépensé, restant", () => {
    expect(lignesRecapFinances({ encaisse: 66_000, depense: 38_000, restant: 28_000 })).toEqual([
      `Encaissé : ${formaterFCFA(66_000)}`,
      `Dépensé : ${formaterFCFA(38_000)}`,
      `Restant : ${formaterFCFA(28_000)}`,
    ]);
  });

  it("avec des bonnes volontés : détail cotisations et dons avant le total", () => {
    expect(lignesRecapFinances({ cotisations: 66_000, dons: 33_000, encaisse: 99_000, depense: 38_000, restant: 61_000 })).toEqual([
      `Cotisations : ${formaterFCFA(66_000)}`,
      `Bonnes volontés : ${formaterFCFA(33_000)}`,
      `Encaissé : ${formaterFCFA(99_000)}`,
      `Dépensé : ${formaterFCFA(38_000)}`,
      `Restant : ${formaterFCFA(61_000)}`,
    ]);
  });

  it("signale le dépassement", () => {
    expect(lignesRecapFinances({ encaisse: 10_000, depense: 38_000, restant: -28_000 })[2]).toBe(`Restant : ${formaterFCFA(-28_000)} (dépassement)`);
  });
});

describe("schemaDepense", () => {
  const valide = { date: "2026-10-30", montant: "20 000", motif: "  Complément nourriture ", beneficiaire: "", canal: "CASH", categorie: "NOURRITURE" };

  it("nettoie et convertit la saisie", () => {
    expect(schemaDepense.parse(valide)).toEqual({
      date: new Date("2026-10-30T00:00:00.000Z"),
      montant: 20_000,
      motif: "Complément nourriture",
      beneficiaire: null,
      canal: "CASH",
      categorie: "NOURRITURE",
    });
    expect(schemaDepense.parse({ ...valide, beneficiaire: " Pape Fall " }).beneficiaire).toBe("Pape Fall");
  });

  it.each([
    ["montant vide", { montant: "" }],
    ["montant à zéro", { montant: "0" }],
    ["motif vide", { motif: "  " }],
    ["motif trop long", { motif: "x".repeat(201) }],
    ["catégorie inconnue", { categorie: "LOISIRS" }],
    ["canal manquant", { canal: "" }],
    ["date illisible", { date: "30/10/2026" }],
  ])("refuse : %s", (_cas, changement) => {
    expect(schemaDepense.safeParse({ ...valide, ...changement }).success).toBe(false);
  });

  it("lit le formulaire champ par champ", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(valide)) fd.append(k, v);
    expect(lireFormulaireDepense(fd)).toEqual(valide);
  });
});

describe("donsParDonateur (graphique des bonnes volontés)", () => {
  const don = (donateur: string, montant: number) => ({ donateur, montant });

  it("additionne les dons d'un même donateur (casse et espaces ignorés), du plus gros au plus petit", () => {
    expect(donsParDonateur([don("Tante Ndella", 10_000), don("Oncle Pape", 20_000), don("  tante  ndella ", 25_000)])).toEqual([
      { libelle: "Tante Ndella", valeur: 35_000 },
      { libelle: "Oncle Pape", valeur: 20_000 },
    ]);
  });

  it("réunit au-delà des 4 premiers en « N autres », mais n'isole jamais un seul « autre »", () => {
    const cinq = ["A", "B", "C", "D", "E"].map((n, i) => don(n, 1_000 * (10 - i)));
    expect(donsParDonateur(cinq)).toHaveLength(5);
    const six = [...cinq, don("F", 500)];
    expect(donsParDonateur(six).at(-1)).toEqual({ libelle: "2 autres", valeur: 6_000 + 500 });
  });
});
