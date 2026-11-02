import { describe, expect, it } from "vitest";
import { rechercherPersonnes } from "@/lib/recherche";

const personnes = [
  { id: "1", nomComplet: "Aïssatou Ndiaye", aliasWave: ["Aissatou Fall"], numeros: [{ numero: "771234567" }] },
  { id: "2", nomComplet: "Cheikh Ndour", aliasWave: [], numeros: [{ numero: "781112233" }] },
  { id: "3", nomComplet: "Coumba Sène", aliasWave: [], numeros: [] },
];
const ids = (r: typeof personnes) => r.map((p) => p.id);

describe("rechercherPersonnes", () => {
  it("sans recherche, renvoie tout", () => {
    expect(ids(rechercherPersonnes(personnes, "  "))).toEqual(["1", "2", "3"]);
  });

  it("ignore la casse et les accents", () => {
    expect(ids(rechercherPersonnes(personnes, "AISSATOU"))).toEqual(["1"]);
    expect(ids(rechercherPersonnes(personnes, "sene"))).toEqual(["3"]);
  });

  it("cherche aussi dans les alias Wave", () => {
    expect(ids(rechercherPersonnes(personnes, "fall"))).toEqual(["1"]);
  });

  it("cherche par numéro, même écrit avec des espaces", () => {
    expect(ids(rechercherPersonnes(personnes, "78 111"))).toEqual(["2"]);
  });

  it("2 chiffres seulement ne suffisent pas pour chercher par numéro", () => {
    expect(ids(rechercherPersonnes(personnes, "77"))).toEqual([]);
  });
});
