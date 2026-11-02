import { describe, expect, it } from "vitest";
import { filtrerPersonnes } from "@/components/cotiz/choix-personne";

// Choix d'une personne avec recherche (audit, lot 1).

describe("filtrerPersonnes", () => {
  const personnes = [
    { id: "1", nomComplet: "Aïssatou Ndiaye", numeros: ["771234567"], aliasWave: ["A Ndiaye"] },
    { id: "2", nomComplet: "Cheikh Ndour", numeros: ["781112233"] },
    { id: "3", nomComplet: "Awa Diop", numeros: [] },
  ];

  it("recherche vide : aucun résultat (on ne déroule pas toute la liste)", () => {
    expect(filtrerPersonnes(personnes, "")).toEqual([]);
    expect(filtrerPersonnes(personnes, "   ")).toEqual([]);
  });

  it("par nom, sans accents ni majuscules", () => {
    expect(filtrerPersonnes(personnes, "aissa").map((p) => p.id)).toEqual(["1"]);
    expect(filtrerPersonnes(personnes, "NDOUR").map((p) => p.id)).toEqual(["2"]);
  });

  it("par alias Wave", () => {
    expect(filtrerPersonnes(personnes, "a ndiaye").map((p) => p.id)).toEqual(["1"]);
  });

  it("par bout de numéro, à partir de 3 chiffres", () => {
    expect(filtrerPersonnes(personnes, "77 123").map((p) => p.id)).toEqual(["1"]);
    expect(filtrerPersonnes(personnes, "11 22").map((p) => p.id)).toEqual(["2"]);
    expect(filtrerPersonnes(personnes, "78")).toEqual([]); // trop court : correspondrait à trop de monde
  });
});
