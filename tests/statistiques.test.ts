import { describe, expect, it } from "vitest";
import { recuParCanal, recuParJour, rythmeCollectes, tendancesSemaine, totalReprises, type PaiementRecu } from "@/lib/statistiques";

const jour = new Date("2026-10-21T00:00:00Z");
const p = (iso: string, montant: number, canal: PaiementRecu["canal"] = "WAVE"): PaiementRecu => ({ dateReception: new Date(iso), montant, canal });

describe("recuParJour", () => {
  it("couvre exactement les 14 jours qui finissent aujourd'hui, jours vides à 0", () => {
    const jours = recuParJour([], jour);
    expect(jours).toHaveLength(14);
    expect(jours[0].date.toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(jours[13].date.toISOString().slice(0, 10)).toBe("2026-10-21");
    expect(jours.every((j) => j.montant === 0 && j.nombre === 0)).toBe(true);
  });

  it("additionne les paiements du même jour, quelle que soit l'heure (heure de Dakar = UTC)", () => {
    const jours = recuParJour([p("2026-10-21T00:05:00Z", 10_000), p("2026-10-21T23:59:00Z", 5_000), p("2026-10-20T12:00:00Z", 2_000)], jour);
    expect(jours[13]).toMatchObject({ montant: 15_000, nombre: 2 });
    expect(jours[12]).toMatchObject({ montant: 2_000, nombre: 1 });
  });

  it("ignore les paiements hors période (avant le premier jour ou après aujourd'hui)", () => {
    const jours = recuParJour([p("2026-10-07T23:59:00Z", 9_999), p("2026-10-22T00:00:00Z", 8_888), p("2026-10-08T00:00:00Z", 1_000)], jour);
    expect(jours.reduce((s, j) => s + j.montant, 0)).toBe(1_000);
  });
});

describe("recuParCanal", () => {
  it("garde l'ordre fixe Wave, Orange Money, Cash, même à 0", () => {
    expect(recuParCanal([p("2026-10-21T10:00:00Z", 3_000, "CASH"), p("2026-10-21T10:00:00Z", 7_000, "WAVE"), p("2026-10-20T10:00:00Z", 1_000, "WAVE")])).toEqual([
      { canal: "WAVE", montant: 8_000 },
      { canal: "ORANGE_MONEY", montant: 0 },
      { canal: "CASH", montant: 3_000 },
    ]);
  });
});

describe("versés repris d'un import", () => {
  it("ne font pas de faux pic dans « Reçu par jour », mais comptent par canal", () => {
    const paiements = [p("2026-10-21T10:00:00Z", 3_000), { ...p("2026-10-21T09:00:00Z", 50_000, "ORANGE_MONEY"), reprise: true }];
    expect(recuParJour(paiements, jour)[13]).toMatchObject({ montant: 3_000, nombre: 1 });
    expect(recuParCanal(paiements).find((c) => c.canal === "ORANGE_MONEY")?.montant).toBe(50_000);
    expect(totalReprises(paiements)).toBe(50_000);
  });
});

describe("tendancesSemaine", () => {
  it("compare les 7 derniers jours aux 7 d'avant (total et moyenne par jour)", () => {
    const jours = recuParJour([p("2026-10-09T10:00:00Z", 7_000), p("2026-10-20T10:00:00Z", 14_000), p("2026-10-21T10:00:00Z", 7_000)], jour);
    expect(tendancesSemaine(jours)).toEqual({
      recu: { actuelle: 21_000, precedente: 7_000, ecart: 14_000 },
      moyenne: { actuelle: 3_000, precedente: 1_000, ecart: 2_000 },
    });
  });
});

describe("rythmeCollectes (collectes seulement)", () => {
  const debut = new Date("2026-10-14T00:00:00Z");
  const echeance = new Date("2026-11-13T00:00:00Z"); // 30 jours
  const auJour = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("à mi-chemin, la moitié de l'attendu ; l'écart dit le retard ; le nécessaire par jour compte aujourd'hui", () => {
    const r = rythmeCollectes([{ dateDebut: debut, dateEcheance: echeance, attendu: 160_000, recu: 27_000 }], auJour("2026-10-29"));
    expect(r).toMatchObject({ attenduAujourdhui: 80_000, ecart: -53_000, echeancePassee: false });
    expect(r?.necessaireParJour).toBe(Math.ceil(133_000 / 16)); // du 29/10 au 13/11 inclus
  });

  it("en avance : écart positif ; tout reçu : plus rien de nécessaire", () => {
    expect(rythmeCollectes([{ dateDebut: debut, dateEcheance: echeance, attendu: 100_000, recu: 60_000 }], auJour("2026-10-29"))?.ecart).toBe(10_000);
    expect(rythmeCollectes([{ dateDebut: debut, dateEcheance: echeance, attendu: 100_000, recu: 100_000 }], auJour("2026-10-29"))?.necessaireParJour).toBe(0);
  });

  it("le jour de l'ouverture, rien d'attendu ; après l'échéance, plus de rythme ; aucun cycle : null", () => {
    expect(rythmeCollectes([{ dateDebut: debut, dateEcheance: echeance, attendu: 100_000, recu: 0 }], debut)?.attenduAujourdhui).toBe(0);
    const passe = rythmeCollectes([{ dateDebut: debut, dateEcheance: echeance, attendu: 100_000, recu: 40_000 }], auJour("2026-11-20"));
    expect(passe).toMatchObject({ echeancePassee: true, necessaireParJour: 0, attenduAujourdhui: 100_000 });
    expect(rythmeCollectes([], debut)).toBeNull();
  });

  it("additionne plusieurs collectes", () => {
    const r = rythmeCollectes(
      [
        { dateDebut: debut, dateEcheance: echeance, attendu: 60_000, recu: 30_000 },
        { dateDebut: debut, dateEcheance: echeance, attendu: 40_000, recu: 0 },
      ],
      auJour("2026-10-29"),
    );
    expect(r).toMatchObject({ attendu: 100_000, recu: 30_000, attenduAujourdhui: 50_000, ecart: -20_000 });
  });
});
