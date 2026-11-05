import { describe, expect, it } from "vitest";
import { lireModeleOrangeMoney, modeleOrangeMoney } from "@/lib/capture/modele-orange-money";

const aujourdhui = new Date("2026-10-31T00:00:00Z");

describe("modèle Orange Money (date depuis l'application, sans SMS)", () => {
  it("prérempli : montant, nom, numéro, mois en cours ; date, heure et référence à compléter", () => {
    const modele = modeleOrangeMoney({ montant: 5_000, nom: "Khady Diallo", numero: "770000979", aujourdhui });
    expect(modele.split("\n")[1]).toBe("Date : JJ/10/2026 à HHhMM");
    expect(modele.split("\n")[2]).toBe("Référence : PP");
    expect(modele).toContain("Khady Diallo (77 000 09 79)");
    expect(lireModeleOrangeMoney(modele)).toEqual({ montant: 5_000, dateReception: null, reference: null });
  });

  it("complété comme dans l'application (heure « 11:52 » ou « 11h52 »)", () => {
    const rempli = ["Orange Money · 5 000 FCFA de Khady Diallo", "Date : 30/10/2026 à 11:52", "Référence : pp260415.0932.c48217"].join("\n");
    expect(lireModeleOrangeMoney(rempli)).toEqual({ montant: 5_000, dateReception: new Date("2026-10-30T11:52:00Z"), reference: "PP260415.0932.C48217" });
    expect(lireModeleOrangeMoney(rempli.replace("11:52", "11h52")).dateReception).toEqual(new Date("2026-10-30T11:52:00Z"));
  });

  it("refuse une date impossible et une référence trop courte", () => {
    expect(lireModeleOrangeMoney("Date : 31/02/2026 à 10h00\nRéférence : PP12").dateReception).toBeNull();
    expect(lireModeleOrangeMoney("Date : 31/02/2026 à 10h00\nRéférence : PP12").reference).toBeNull();
  });
});
