import { describe, expect, it } from "vitest";
import { construireHistorique, etatCase, type EntreeHistorique } from "@/lib/suivi/historique";

const e = (ligneId: string, cycleNumero: number, paye: number, extra: Partial<EntreeHistorique> = {}): EntreeHistorique => ({
  ligneId,
  libelle: ligneId,
  ordre: null,
  actif: true,
  cycleNumero,
  cycleOuvert: false,
  montantDu: 10_000,
  paye,
  ...extra,
});

describe("etatCase", () => {
  it.each([
    [10_000, false, "PAYE"],
    [12_000, false, "PAYE"],
    [4_000, false, "PARTIEL"],
    [0, false, "NON_PAYE"],
    [0, true, "EN_ATTENTE"],
    [4_000, true, "PARTIEL"],
  ] as const)("payé %i, cycle ouvert %s → %s", (paye, ouvert, attendu) => {
    expect(etatCase(10_000, paye, ouvert)).toBe(attendu);
  });
});

describe("construireHistorique", () => {
  it("une ligne par membre, une colonne par cycle ; « pas membre » quand il n'a pas d'échéance", () => {
    const h = construireHistorique([e("awa", 1, 10_000), e("awa", 2, 0), e("fatou", 2, 5_000), e("awa", 3, 0, { cycleOuvert: true }), e("fatou", 3, 0, { cycleOuvert: true })]);
    expect(h.cycles).toEqual([1, 2, 3]);
    expect([...h.ouverts]).toEqual([3]);
    expect(h.lignes.find((l) => l.ligneId === "awa")?.cases).toEqual(["PAYE", "NON_PAYE", "EN_ATTENTE"]);
    expect(h.lignes.find((l) => l.ligneId === "fatou")?.cases).toEqual(["ABSENT", "PARTIEL", "EN_ATTENTE"]);
  });

  it("compte les cycles clôturés payés, sans le cycle ouvert", () => {
    const h = construireHistorique([e("awa", 1, 10_000), e("awa", 2, 0), e("awa", 3, 10_000, { cycleOuvert: true })]);
    expect(h.lignes[0]).toMatchObject({ payes: 1, echeances: 2 });
  });

  it("trie actifs d'abord, par ordre de passage puis nom", () => {
    const h = construireHistorique([
      e("Binta", 1, 0, { ordre: null }),
      e("Coumba", 1, 0, { ordre: 2 }),
      e("Awa", 1, 0, { ordre: 1, actif: false }),
      e("Aïda", 1, 0, { ordre: null }),
    ]);
    expect(h.lignes.map((l) => l.ligneId)).toEqual(["Coumba", "Aïda", "Binta", "Awa"]);
  });

  it("ne garde que les 12 cycles les plus récents", () => {
    const h = construireHistorique(Array.from({ length: 15 }, (_, i) => e("awa", i + 1, 0)));
    expect(h.cycles).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(h.lignes[0].cases).toHaveLength(12);
  });
});
