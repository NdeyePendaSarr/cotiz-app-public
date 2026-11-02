import { describe, expect, it } from "vitest";
import { preparerCaptureSms } from "@/lib/capture/sms";
import { lireModeleWave, modeleWave } from "@/lib/capture/modele-wave";

const aujourdhui = new Date("2026-10-31T00:00:00Z");

describe("modèle Wave (paiement sans SMS, depuis l'application)", () => {
  it("prérempli au format du SMS : montant, nom, numéro, mois en cours ; date, heure et ID à compléter", () => {
    expect(modeleWave({ montant: 2_000, nom: "Khady Ndiaye", numero: "771234543", aujourdhui })).toBe(
      ["Vous avez recu 2.000F", "De Khady Ndiaye (77 123 45 43)", "JJ/10/2026 à HHhMM", "ID de transaction : T_"].join("\n"),
    );
    expect(modeleWave({ montant: 1_250_000, nom: null, numero: null, aujourdhui })).toContain("Vous avez recu 1.250.000F\nDe Nom\n");
  });

  it("non complété : ni date lisible, ni ID", () => {
    const { texteSms, reference } = lireModeleWave(modeleWave({ montant: 2_000, nom: "Khady", numero: null, aujourdhui }));
    expect(reference).toBeNull();
    expect(preparerCaptureSms(texteSms).type).not.toBe("paiement");
  });

  it("complété : date et heure lues comme un SMS, ID de l'application ramené à la référence du SMS", () => {
    const rempli = ["Vous avez recu 2.000F", "De Khady Ndiaye (77 123 45 43)", "30/10/2026 à 10h14", "ID de transaction : T_QWE4RTYU-IOPASDFG"].join("\n");
    const { texteSms, reference } = lireModeleWave(rempli);
    expect(reference).toBe("TQWE4RTYUIOPASDFG");
    const lu = preparerCaptureSms(texteSms);
    expect(lu.type).toBe("paiement");
    if (lu.type === "paiement") expect(lu.donnees).toMatchObject({ montant: 2_000, dateReception: new Date("2026-10-30T10:14:00Z") });
  });
});
