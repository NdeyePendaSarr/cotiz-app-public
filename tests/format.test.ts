import { describe, expect, it } from "vitest";
import { formaterDate, formaterFCFA, libelleEcheance, versChampDate } from "@/lib/format";

// Espaces utilisées par le format français : fine insécable (milliers), insécable (avant FCFA).
const FINE = " ";
const INSECABLE = " ";

describe("formaterFCFA", () => {
  it.each([
    [500, `500${INSECABLE}FCFA`],
    [25_000, `25${FINE}000${INSECABLE}FCFA`],
    [1_250_000, `1${FINE}250${FINE}000${INSECABLE}FCFA`],
  ])("%i → « %s »", (montant, attendu) => {
    expect(formaterFCFA(montant)).toBe(attendu);
  });

  it("se lit « 25 000 FCFA » une fois les espaces spéciales remplacées", () => {
    expect(formaterFCFA(25_000).replace(/[  ]/g, " ")).toBe("25 000 FCFA");
  });
});

describe("dates", () => {
  const date = new Date("2026-12-15T00:00:00.000Z");

  it("formaterDate affiche la date sans décalage de jour", () => {
    expect(formaterDate(date)).toBe("15 décembre 2026");
  });

  it("écrit « 1er » pour le premier du mois (mais pas pour le 10 ou le 11)", () => {
    expect(formaterDate(new Date("2026-10-01T00:00:00.000Z"))).toBe("1er octobre 2026");
    expect(formaterDate(new Date("2026-10-11T00:00:00.000Z"))).toBe("11 octobre 2026");
  });

  it("versChampDate donne la valeur d'un <input type=date>", () => {
    expect(versChampDate(date)).toBe("2026-12-15");
  });
});

describe("libelleEcheance", () => {
  it.each([
    ["MENSUELLE", 5, "le 5 de chaque mois"],
    ["MENSUELLE", 1, "le 1er de chaque mois"],
    ["HEBDOMADAIRE", 6, "chaque samedi"],
    ["HEBDOMADAIRE", 1, "chaque lundi"],
  ] as const)("%s, jour %i → « %s »", (frequence, jour, attendu) => {
    expect(libelleEcheance(frequence, jour)).toBe(attendu);
  });

  it("renvoie null sans fréquence ou avec un jour invalide", () => {
    expect(libelleEcheance(null, 5)).toBeNull();
    expect(libelleEcheance("HEBDOMADAIRE", 9)).toBeNull();
  });
});
