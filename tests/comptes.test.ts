import { describe, expect, it } from "vitest";
import { analyserHistoriqueCompte, cleMouvement, courbeSolde, lireDate, lireSens, soldeCompte, type Mouvement } from "@/lib/comptes";

// Comptes gardés : argent gardé pour une personne (versements, retraits, solde négatif autorisé).

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const mouvements: Mouvement[] = [
  { date: d("2026-01-05"), montant: 50_000, sens: "VERSEMENT" },
  { date: d("2026-01-20"), montant: 20_000, sens: "RETRAIT" },
  { date: d("2026-01-20"), montant: 5_000, sens: "VERSEMENT" },
  { date: d("2026-02-02"), montant: 45_000, sens: "RETRAIT" },
];

describe("soldeCompte et courbeSolde", () => {
  it("versé − retiré, négatif autorisé", () => {
    expect(soldeCompte(mouvements)).toEqual({ verse: 55_000, retire: 65_000, solde: -10_000, nombre: 4 });
    expect(soldeCompte([])).toEqual({ verse: 0, retire: 0, solde: 0, nombre: 0 });
  });

  it("un point par jour, dans l'ordre, solde cumulé", () => {
    expect(courbeSolde([...mouvements].reverse()).map((p) => [p.date.toISOString().slice(0, 10), p.solde])).toEqual([
      ["2026-01-05", 50_000],
      ["2026-01-20", 35_000],
      ["2026-02-02", -10_000],
    ]);
  });
});

describe("lireDate et lireSens", () => {
  it("formats courants d'un tableau Word ou Excel", () => {
    expect(lireDate("12/03/2026")).toEqual(d("2026-03-12"));
    expect(lireDate("12/03/26")).toEqual(d("2026-03-12"));
    expect(lireDate("2026-03-12")).toEqual(d("2026-03-12"));
    expect(lireDate("1er mars 2026")).toEqual(d("2026-03-01"));
    expect(lireDate("12 Février 2026")).toEqual(d("2026-02-12"));
    expect(lireDate("31/02/2026")).toBeNull();
    expect(lireDate("hier")).toBeNull();
  });

  it("versement / retrait en toutes lettres", () => {
    expect(lireSens("Reçu")).toBe("VERSEMENT");
    expect(lireSens("Dépôt")).toBe("VERSEMENT");
    expect(lireSens("Envoyé")).toBe("RETRAIT");
    expect(lireSens("retrait")).toBe("RETRAIT");
    expect(lireSens("?")).toBeNull();
  });
});

describe("analyserHistoriqueCompte", () => {
  it("deux colonnes de montants (versement, retrait), canal et note", () => {
    const a = analyserHistoriqueCompte(
      ["Date\tVersement\tRetrait\tCanal\tNote", "05/01/2026\t50 000\t\tWave\tSalaire", "20/01/2026\t\t20.000\tCash\tLoyer", "Total\t50 000\t20 000\t\t"].join("\n"),
    );
    expect(a.enTete).toBe(true);
    expect(a.lignes.map((l) => [l.date?.toISOString().slice(0, 10), l.sens, l.montant, l.canal, l.note, l.erreur])).toEqual([
      ["2026-01-05", "VERSEMENT", 50_000, "WAVE", "Salaire", null],
      ["2026-01-20", "RETRAIT", 20_000, "CASH", "Loyer", null],
    ]);
  });

  it("une colonne montant + une colonne sens ; erreurs signalées ligne par ligne", () => {
    const a = analyserHistoriqueCompte(
      ["Date;Opération;Montant", "02/02/2026;Envoyé;45 000", "03/02/2026;??;1 000", "pas une date;Reçu;2 000", "04/02/2026;Reçu;"].join("\n"),
    );
    expect(a.lignes.map((l) => [l.sens, l.montant, l.erreur])).toEqual([
      ["RETRAIT", 45_000, null],
      [null, 1_000, "Sens illisible : versement ou retrait ?"],
      ["VERSEMENT", 2_000, "Date illisible « pas une date »."],
      ["VERSEMENT", null, "Montant illisible ou absent."],
    ]);
  });

  it("sans en-tête reconnu : chaque ligne le signale", () => {
    expect(analyserHistoriqueCompte("05/01/2026\t50 000").lignes[0].erreur).toMatch(/En-tête introuvable/);
  });

  it("clé de doublon : même jour, même sens, même montant", () => {
    expect(cleMouvement({ date: d("2026-01-05"), sens: "VERSEMENT", montant: 50_000 })).toBe("2026-01-05|VERSEMENT|50000");
  });
});
