import { describe, expect, it } from "vitest";
import {
  aujourdhui,
  joursDansLeMois,
  prochaineEcheance,
  prochaineEcheanceHebdomadaire,
  prochaineEcheanceMensuelle,
} from "@/lib/cycles/dates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("joursDansLeMois", () => {
  it.each([
    [2026, 1, 28], // février 2026
    [2028, 1, 29], // février bissextile
    [2026, 3, 30], // avril
    [2026, 11, 31], // décembre
  ])("%i, mois %i → %i jours", (annee, mois, attendu) => {
    expect(joursDansLeMois(annee, mois)).toBe(attendu);
  });
});

describe("prochaineEcheanceMensuelle", () => {
  it.each([
    ["2026-10-28", 5, "2026-11-05"], // exemple du cahier : ouverte le 28/10, échéance le 5/11
    ["2026-10-05", 5, "2026-10-05"], // ouverte le jour même : échéance le jour même
    ["2026-10-04", 5, "2026-10-05"],
    ["2026-04-01", 31, "2026-04-30"], // 31 → 30 avril
    ["2026-02-10", 31, "2026-02-28"], // 31 → 28 février
    ["2028-02-10", 30, "2028-02-29"], // année bissextile
    ["2026-01-31", 31, "2026-01-31"],
    ["2026-02-01", 30, "2026-02-28"],
    ["2026-12-20", 5, "2027-01-05"], // passage d'année
    ["2026-03-31", 30, "2026-04-30"], // 30 mars est passé → 30 avril
  ])("depuis %s, jour %i → %s", (depuis, jour, attendu) => {
    expect(iso(prochaineEcheanceMensuelle(d(depuis), jour))).toBe(attendu);
  });
});

describe("prochaineEcheanceHebdomadaire (1 = lundi … 7 = dimanche)", () => {
  // Le 28/10/2026 est un mercredi.
  it.each([
    ["2026-10-28", 6, "2026-10-31"], // mercredi → samedi suivant
    ["2026-10-28", 3, "2026-10-28"], // mercredi, échéance le mercredi : le jour même
    ["2026-10-28", 1, "2026-11-02"], // → lundi suivant
    ["2026-10-31", 7, "2026-11-01"], // samedi → dimanche
    ["2026-11-01", 7, "2026-11-01"], // dimanche (getUTCDay = 0) → le jour même
    ["2026-12-30", 5, "2027-01-01"], // passage d'année
  ])("depuis %s, jour %i → %s", (depuis, jour, attendu) => {
    expect(iso(prochaineEcheanceHebdomadaire(d(depuis), jour))).toBe(attendu);
  });
});

describe("prochaineEcheance", () => {
  it("choisit le calcul selon la fréquence", () => {
    expect(iso(prochaineEcheance("MENSUELLE", 5, d("2026-10-28")))).toBe("2026-11-05");
    expect(iso(prochaineEcheance("HEBDOMADAIRE", 6, d("2026-10-28")))).toBe("2026-10-31");
  });

  it("null pour une fréquence non gérée ou un jour invalide", () => {
    expect(prochaineEcheance("BIMENSUELLE", 6, d("2026-10-28"))).toBeNull();
    expect(prochaineEcheance("HEBDOMADAIRE", 9, d("2026-10-28"))).toBeNull();
    expect(prochaineEcheance(null, 5, d("2026-10-28"))).toBeNull();
  });
});

describe("aujourdhui", () => {
  it("ramène à minuit UTC (heure de Dakar)", () => {
    expect(aujourdhui(new Date("2026-10-28T23:59:00Z")).toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });
});
