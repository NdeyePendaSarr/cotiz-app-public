import { describe, expect, it } from "vitest";
import { finMensualite, lireMois, montantDuParMembre, moisMensualite, situationMensualite } from "@/lib/mensualite";

// Mensualité de la cellule : 500 FCFA par mois pendant 12 mois, à payer « dans le mois ».

const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const janvier = jour("2026-01-01");

describe("mois d'une mensualité", () => {
  it("lit « 2026-11 » et refuse le reste", () => {
    expect(lireMois("2026-11")?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(lireMois("2026-13")).toBeNull();
    expect(lireMois("novembre")).toBeNull();
  });

  it("12 mois à partir de novembre : passe l'année, février compris", () => {
    const mois = moisMensualite(jour("2026-11-01"), 12);
    expect(mois.map((m) => m.libelle)).toEqual([
      "nov. 26", "déc. 26", "janv. 27", "févr. 27", "mars 27", "avr. 27", "mai 27", "juin 27", "juil. 27", "août 27", "sept. 27", "oct. 27",
    ]);
    expect(mois[3].fin.toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(finMensualite(jour("2026-11-01"), 12).toISOString().slice(0, 10)).toBe("2027-10-31");
  });

  it("montant dû par membre : toute la durée pour une mensualité, la cotisation sinon", () => {
    expect(montantDuParMembre({ type: "MENSUALITE", montantCotisation: 500, nombreMois: 12 })).toBe(6_000);
    expect(montantDuParMembre({ type: "COLLECTE", montantCotisation: 5_000, nombreMois: null })).toBe(5_000);
  });
});

describe("situationMensualite", () => {
  it("rien versé en mars : janvier et février en retard, mars à payer", () => {
    const s = situationMensualite(0, 500, janvier, 12, jour("2026-03-10"));
    expect(s.mois.slice(0, 4).map((m) => m.etat)).toEqual(["RETARD", "RETARD", "EN_COURS", "A_VENIR"]);
    expect(s).toMatchObject({ echu: 1_000, exigible: 1_500, retard: 1_000, avance: 0 });
  });

  it("2 000 versés en mars : les mois les plus anciens d'abord, avril payé d'avance", () => {
    const s = situationMensualite(2_000, 500, janvier, 12, jour("2026-03-10"));
    expect(s.mois.slice(0, 5).map((m) => m.etat)).toEqual(["PAYE", "PAYE", "PAYE", "PAYE", "A_VENIR"]);
    expect(s).toMatchObject({ retard: 0, avance: 500 });
  });

  it("versement partiel : le mois suivant est partiel, en retard une fois terminé", () => {
    expect(situationMensualite(700, 500, janvier, 12, jour("2026-02-10")).mois[1]).toMatchObject({ etat: "PARTIEL", couvert: 200 });
    const apres = situationMensualite(700, 500, janvier, 12, jour("2026-03-01"));
    expect(apres.mois[1]).toMatchObject({ etat: "RETARD", couvert: 200 });
    expect(apres.retard).toBe(300);
  });

  it("le dernier jour du mois n'est pas encore un retard", () => {
    expect(situationMensualite(0, 500, janvier, 12, jour("2026-01-31")).mois[0].etat).toBe("EN_COURS");
    expect(situationMensualite(0, 500, janvier, 12, jour("2026-02-01")).mois[0].etat).toBe("RETARD");
  });

  it("avant le premier mois : rien n'est dû ; tout payé : avance plafonnée à la durée", () => {
    expect(situationMensualite(0, 500, janvier, 12, jour("2025-12-20"))).toMatchObject({ exigible: 0, retard: 0 });
    expect(situationMensualite(9_000, 500, janvier, 12, jour("2026-01-05")).avance).toBe(5_500);
  });
});
