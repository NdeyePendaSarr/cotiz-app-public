import { describe, expect, it } from "vitest";
import type { EcheanceDue } from "@/lib/matching/allocation";
import type { Identification } from "@/lib/matching/personne";
import { repartitionSure } from "@/lib/matching/surete";

const E = (id: string, caisseNom: string, cycleNumero: number, dateEcheance: string, montantDu: number, dejaAlloue = 0): EcheanceDue => ({
  id,
  caisseNom,
  cycleNumero,
  dateEcheance,
  montantDu,
  dejaAlloue,
});
const mensuelle = E("m1", "Tontine mensuelle", 1, "2026-11-05", 10_000);
const hebdo = E("h1", "Tontine hebdo", 1, "2026-10-31", 2_000);

const parNumero: Identification = { proposee: "awa", candidats: [{ id: "awa", nomComplet: "Awa", confiance: "haute", raison: "numéro connu" }] };
const parNom: Identification = { proposee: "awa", candidats: [{ id: "awa", nomComplet: "Awa", confiance: "moyenne", raison: "même nom" }] };

describe("repartitionSure (validation groupée)", () => {
  it("numéro connu + montant égal à une échéance : sûr", () => {
    expect(repartitionSure(parNumero, 10_000, [mensuelle, hebdo])).toEqual({ lignes: [{ echeanceId: "m1", montant: 10_000 }], excedent: 0 });
  });

  it("numéro connu + combinaison exacte de deux caisses : sûr", () => {
    expect(repartitionSure(parNumero, 12_000, [mensuelle, hebdo])?.lignes).toHaveLength(2);
  });

  it("nom ou alias identique seulement (confiance moyenne) : à vérifier", () => {
    expect(repartitionSure(parNom, 10_000, [mensuelle])).toBeNull();
  });

  it("numéro partagé par deux personnes : à vérifier", () => {
    const couple: Identification = {
      proposee: null,
      candidats: [
        { id: "awa", nomComplet: "Awa", confiance: "haute", raison: "numéro connu" },
        { id: "modou", nomComplet: "Modou", confiance: "haute", raison: "numéro connu" },
      ],
    };
    expect(repartitionSure(couple, 10_000, [mensuelle])).toBeNull();
  });

  it("paiement partiel ou excédent : à vérifier", () => {
    expect(repartitionSure(parNumero, 4_000, [mensuelle])).toBeNull();
    expect(repartitionSure(parNumero, 15_000, [mensuelle])).toBeNull();
    expect(repartitionSure(parNumero, 10_000, [])).toBeNull();
  });

  it("deux échéances possibles pour le même montant (autre répartition possible) : à vérifier", () => {
    const deux = [E("a", "Caisse A", 1, "2026-11-05", 10_000), E("b", "Caisse B", 1, "2026-11-05", 10_000)];
    expect(repartitionSure(parNumero, 10_000, deux)).toBeNull();
  });
});
