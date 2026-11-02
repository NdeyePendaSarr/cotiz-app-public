import { describe, expect, it } from "vitest";
import { statutEcheance } from "@/lib/echeances/statut";
import { proposerRepartition, verifierRepartition, type EcheanceDue } from "@/lib/matching/allocation";

const E = (id: string, caisseNom: string, cycleNumero: number, dateEcheance: string, montantDu: number, dejaAlloue = 0): EcheanceDue => ({
  id,
  caisseNom,
  cycleNumero,
  dateEcheance,
  montantDu,
  dejaAlloue,
});
// Une personne dans 2 caisses (cas de la démo : mensuelle 10 000 + hebdo 2 000).
const mensuelle = E("m1", "Tontine mensuelle", 1, "2026-11-05", 10_000);
const hebdo = E("h1", "Tontine hebdo", 1, "2026-10-31", 2_000);

describe("statutEcheance", () => {
  it.each([
    [10_000, 0, "EN_ATTENTE"],
    [10_000, 4_000, "PARTIEL"],
    [10_000, 10_000, "PAYE"],
    [10_000, 12_000, "PAYE"],
  ] as const)("dû %i, alloué %i → %s", (du, alloue, attendu) => {
    expect(statutEcheance(du, alloue)).toBe(attendu);
  });
});

describe("proposerRepartition : tests obligatoires du cahier", () => {
  it("personne dans 2 caisses, paiement qui couvre les deux (12 000 = 10 000 + 2 000)", () => {
    const p = proposerRepartition(12_000, [mensuelle, hebdo]);
    expect(p.type).toBe("combinaison");
    expect(p.principale).toEqual({
      lignes: [
        { echeanceId: "h1", montant: 2_000 }, // la plus ancienne d'abord
        { echeanceId: "m1", montant: 10_000 },
      ],
      excedent: 0,
    });
  });

  it("montant partiel : la plus ancienne est remplie en partie", () => {
    const p = proposerRepartition(1_500, [mensuelle, hebdo]);
    expect(p.type).toBe("plus_anciennes");
    expect(p.principale).toEqual({ lignes: [{ echeanceId: "h1", montant: 1_500 }], excedent: 0 });
  });

  it("montant supérieur au dû : tout est payé, le surplus est « à rembourser »", () => {
    const p = proposerRepartition(15_000, [mensuelle, hebdo]);
    expect(p.principale).toEqual({
      lignes: [
        { echeanceId: "h1", montant: 2_000 },
        { echeanceId: "m1", montant: 10_000 },
      ],
      excedent: 3_000,
    });
  });
});

describe("proposerRepartition : autres cas", () => {
  it("montant = une échéance : elle seule", () => {
    expect(proposerRepartition(10_000, [mensuelle, hebdo]).principale).toEqual({ lignes: [{ echeanceId: "m1", montant: 10_000 }], excedent: 0 });
  });

  it("plusieurs échéances équivalentes : la plus ancienne, les autres en alternatives (« Autre option »)", () => {
    const caisseA = E("a", "Caisse A", 8, "2026-10-31", 2_000);
    const caisseB = E("b", "Caisse B", 9, "2026-10-31", 2_000);
    const plusRecente = E("c", "Caisse C", 2, "2026-11-07", 2_000);
    const p = proposerRepartition(2_000, [plusRecente, caisseB, caisseA]);
    expect(p.principale.lignes).toEqual([{ echeanceId: "a", montant: 2_000 }]);
    expect(p.alternatives.map((r) => r.lignes[0].echeanceId)).toEqual(["b", "c"]);
  });

  it("arriérés : un cycle clôturé non payé passe avant le cycle en cours", () => {
    const arriere = E("vieux", "Tontine hebdo", 7, "2026-10-24", 2_000);
    expect(proposerRepartition(2_000, [hebdo, arriere]).principale.lignes).toEqual([{ echeanceId: "vieux", montant: 2_000 }]);
  });

  it("le reste dû compte, pas le montant dû (échéance déjà payée en partie)", () => {
    const entamee = E("m1", "Tontine mensuelle", 1, "2026-11-05", 10_000, 4_000);
    expect(proposerRepartition(6_000, [entamee]).principale).toEqual({ lignes: [{ echeanceId: "m1", montant: 6_000 }], excedent: 0 });
  });

  it("les échéances déjà payées sont ignorées", () => {
    const payee = E("p", "Tontine hebdo", 1, "2026-10-01", 2_000, 2_000);
    expect(proposerRepartition(2_000, [payee]).type).toBe("aucune_echeance");
  });

  it("personne sans échéance due : tout le paiement est « à rembourser »", () => {
    expect(proposerRepartition(5_000, [])).toEqual({ type: "aucune_echeance", principale: { lignes: [], excedent: 5_000 }, alternatives: [] });
  });
});

describe("verifierRepartition (refait côté serveur)", () => {
  const dues = [mensuelle, hebdo];
  it("accepte une répartition valide, avec excédent", () => {
    expect(verifierRepartition(15_000, [{ echeanceId: "m1", montant: 10_000 }], dues)).toBeNull();
  });
  it.each([
    ["au-delà du reste dû (plafond)", 20_000, [{ echeanceId: "h1", montant: 3_000 }]],
    ["somme supérieure au paiement", 5_000, [{ echeanceId: "m1", montant: 6_000 }]],
    ["échéance d'une autre personne", 2_000, [{ echeanceId: "inconnue", montant: 2_000 }]],
    ["montant nul", 2_000, [{ echeanceId: "h1", montant: 0 }]],
    ["même échéance deux fois", 4_000, [{ echeanceId: "h1", montant: 1_000 }, { echeanceId: "h1", montant: 1_000 }]],
  ])("refuse : %s", (_cas, montant, lignes) => {
    expect(verifierRepartition(montant, lignes, dues)).not.toBeNull();
  });
});
