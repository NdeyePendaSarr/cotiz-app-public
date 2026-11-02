import { describe, expect, it } from "vitest";
import { collecteDuDon, excedentPaiement } from "@/lib/dons";
import { schemaDon } from "@/lib/validation/don";

// Bonnes volontés : dons à une collecte, en plus des cotisations.

const caisse = (id: string, type: "TONTINE" | "COLLECTE", statut: "ACTIVE" | "ARCHIVEE" = "ACTIVE") => ({ echeance: { cycle: { caisse: { id, nom: `Caisse ${id}`, type, statut } } } });

describe("excedentPaiement", () => {
  it("montant − cotisations − bonne volonté", () => {
    expect(excedentPaiement(5_000, [{ montant: 2_000 }])).toBe(3_000);
    expect(excedentPaiement(5_000, [{ montant: 2_000 }], { montant: 3_000 })).toBe(0);
    expect(excedentPaiement(5_000, [{ montant: 2_000 }], { montant: 1_000 })).toBe(2_000);
    expect(excedentPaiement(5_000, [{ montant: 2_000 }], null)).toBe(3_000);
  });
});

describe("collecteDuDon", () => {
  it("une seule collecte active : le surplus peut y devenir une bonne volonté", () => {
    expect(collecteDuDon([caisse("s", "COLLECTE")])).toEqual({ id: "s", nom: "Caisse s" });
    expect(collecteDuDon([caisse("s", "COLLECTE"), caisse("s", "COLLECTE")])).toEqual({ id: "s", nom: "Caisse s" });
  });

  it("tontine, collecte archivée, plusieurs caisses ou aucune cotisation : non", () => {
    expect(collecteDuDon([caisse("t", "TONTINE")])).toBeNull();
    expect(collecteDuDon([caisse("s", "COLLECTE", "ARCHIVEE")])).toBeNull();
    expect(collecteDuDon([caisse("s", "COLLECTE"), caisse("t", "TONTINE")])).toBeNull();
    expect(collecteDuDon([])).toBeNull();
  });
});

describe("schemaDon", () => {
  const valide = { date: "2026-10-31", montant: "30 000", donateur: "  Ibou ", remisPar: "", canal: "WAVE", note: "" };

  it("nettoie et convertit la saisie", () => {
    expect(schemaDon.parse(valide)).toEqual({ date: new Date("2026-10-31T00:00:00.000Z"), montant: 30_000, donateur: "Ibou", remisPar: null, canal: "WAVE", note: null });
  });

  it("« Remis par » : l'intermédiaire, nettoyé ; vide = envoyé directement", () => {
    expect(schemaDon.parse({ ...valide, remisPar: "  Lamine " }).remisPar).toBe("Lamine");
    expect(schemaDon.safeParse({ ...valide, remisPar: "x".repeat(151) }).success).toBe(false);
  });

  it("refuse un donateur vide, un montant nul ou un canal inconnu", () => {
    const erreurs = schemaDon.safeParse({ ...valide, donateur: "  ", montant: "0", canal: "CB" }).error?.issues.map((i) => i.path[0]);
    expect(erreurs).toEqual(expect.arrayContaining(["donateur", "montant", "canal"]));
  });
});
