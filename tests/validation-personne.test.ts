import { describe, expect, it } from "vitest";
import { chercherDoublons, lireFormulairePersonne, schemaPersonne, type PersonneComparee } from "@/lib/validation/personne";

const base = { nomComplet: "Aïssatou Ndiaye", numeros: [], aliasWave: [] };

function formulaire(champs: [string, string][]) {
  const fd = new FormData();
  for (const [cle, valeur] of champs) fd.append(cle, valeur);
  return fd;
}

describe("schemaPersonne", () => {
  it("nettoie le nom et normalise les numéros", () => {
    const r = schemaPersonne.parse({
      nomComplet: "  Aïssatou   Ndiaye ",
      numeros: [{ numero: "+221 77 123 45 67", libelle: " numéro du mari " }, { numero: "781112233", libelle: "" }],
      aliasWave: [],
    });
    expect(r.nomComplet).toBe("Aïssatou Ndiaye");
    expect(r.numeros).toEqual([
      { numero: "771234567", libelle: "numéro du mari" },
      { numero: "781112233", libelle: null },
    ]);
  });

  it("accepte une personne sans numéro ni alias (paiement en cash)", () => {
    expect(schemaPersonne.safeParse(base).success).toBe(true);
  });

  it("garde plusieurs alias, retire les vides et les doublons (casse et accents ignorés)", () => {
    const r = schemaPersonne.parse({ ...base, aliasWave: ["Aissatou Fall", "", "aïssatou  FALL", "Ndeye Diop"] });
    expect(r.aliasWave).toEqual(["Aissatou Fall", "Ndeye Diop"]);
  });

  it.each([
    ["nom vide", { nomComplet: "   " }, "nomComplet"],
    ["numéro de 8 chiffres", { numeros: [{ numero: "77123456", libelle: "" }] }, "numeros"],
    ["libellé trop long", { numeros: [{ numero: "771234567", libelle: "x".repeat(51) }] }, "numeros"],
    ["trop de numéros", { numeros: Array.from({ length: 6 }, (_, i) => ({ numero: `7700000${10 + i}`, libelle: "" })) }, "numeros"],
  ])("refuse : %s", (_cas, modif, champ) => {
    const r = schemaPersonne.safeParse({ ...base, ...modif });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe(champ);
  });

  it("refuse deux fois le même numéro, même écrit différemment", () => {
    const r = schemaPersonne.safeParse({
      ...base,
      numeros: [{ numero: "771234567", libelle: "" }, { numero: "+221 77 123 45 67", libelle: "" }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["numeros", 1, "numero"], message: "Numéro en double." });
  });
});

describe("lireFormulairePersonne", () => {
  it("assemble les listes numero[] / libelle[] et ignore les lignes vides", () => {
    const fd = formulaire([
      ["nomComplet", "Awa Diop"],
      ["numero", "771234567"],
      ["libelle", "perso"],
      ["numero", ""],
      ["libelle", ""],
      ["alias", "Awa Fall"],
    ]);
    expect(lireFormulairePersonne(fd)).toEqual({
      nomComplet: "Awa Diop",
      cellule: "",
      numeros: [{ numero: "771234567", libelle: "perso" }],
      aliasWave: ["Awa Fall"],
    });
  });
});

describe("chercherDoublons", () => {
  const awa: PersonneComparee = { id: "1", nomComplet: "Awa Diop", aliasWave: ["Awa Fall"], numeros: ["771234567"] };
  const awaHomonyme: PersonneComparee = { id: "2", nomComplet: "Awa Diop", aliasWave: [], numeros: ["781112233"] };
  const moussa: PersonneComparee = { id: "3", nomComplet: "Cheikh Ndour", aliasWave: [], numeros: ["771234567"] }; // mari, même numéro
  const existantes = [awa, awaHomonyme, moussa];

  it("même numéro : trouve toutes les personnes qui l'ont (numéro partagé par un couple)", () => {
    const d = chercherDoublons({ nomComplet: "Quelqu'un", numeros: ["771234567"] }, existantes);
    expect(d.memeNumero.map((x) => x.personne.id)).toEqual(["1", "3"]);
    expect(d.memeNom).toEqual([]);
  });

  it("même nom, autre numéro : « doublon possible » (homonymes), sans fusion", () => {
    const d = chercherDoublons({ nomComplet: "awa  DIOP", numeros: ["700000000"] }, existantes);
    expect(d.memeNumero).toEqual([]);
    expect(d.memeNom.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("un alias identique compte comme un même nom", () => {
    const d = chercherDoublons({ nomComplet: "Awa Fall", numeros: [] }, existantes);
    expect(d.memeNom.map((p) => p.id)).toEqual(["1"]);
  });

  it("une personne trouvée par numéro n'est pas répétée dans « même nom »", () => {
    const d = chercherDoublons({ nomComplet: "Awa Diop", numeros: ["771234567"] }, existantes);
    expect(d.memeNumero.map((x) => x.personne.id)).toEqual(["1", "3"]);
    expect(d.memeNom.map((p) => p.id)).toEqual(["2"]);
  });

  it("en modification, la personne ne se trouve pas elle-même", () => {
    const d = chercherDoublons({ nomComplet: "Awa Diop", numeros: ["771234567"] }, existantes, "1");
    expect(d.memeNumero.map((x) => x.personne.id)).toEqual(["3"]);
    expect(d.memeNom.map((p) => p.id)).toEqual(["2"]);
  });

  it("aucun doublon pour une nouvelle personne", () => {
    const d = chercherDoublons({ nomComplet: "Coumba Sène", numeros: ["761234567"] }, existantes);
    expect(d).toEqual({ memeNumero: [], memeNom: [] });
  });
});

describe("cellule (phase 10)", () => {
  const personne = { nomComplet: "Awa Diop", numeros: [], aliasWave: [] };

  it("facultative : absente ou vide → null ; espaces nettoyés", () => {
    expect(schemaPersonne.parse(personne).cellule).toBeNull();
    expect(schemaPersonne.parse({ ...personne, cellule: "  " }).cellule).toBeNull();
    expect(schemaPersonne.parse({ ...personne, cellule: "  Organisation  " }).cellule).toBe("Organisation");
  });

  it("refuse plus de 50 caractères", () => {
    expect(schemaPersonne.safeParse({ ...personne, cellule: "x".repeat(51) }).success).toBe(false);
  });
});
