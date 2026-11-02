import { describe, expect, it } from "vitest";
import { formaterTelephone, normaliserTelephone } from "@/lib/telephone";
import { nettoyerNom, normaliserNom } from "@/lib/texte";

describe("normaliserNom", () => {
  it.each([
    ["Aïssatou  NDIAYE", "aissatou ndiaye"],
    ["  Bay Mbengué ", "bay mbengue"],
    ["Mame Diarra   Fall", "mame diarra fall"],
    ["CHÉRIF", "cherif"],
  ])("« %s » → « %s »", (nom, attendu) => {
    expect(normaliserNom(nom)).toBe(attendu);
  });

  it("rend comparables deux écritures du même nom", () => {
    expect(normaliserNom("Coumba Sène")).toBe(normaliserNom("coumba  sene"));
  });

  it("ne lève pas d'exception sur une valeur non textuelle", () => {
    expect(normaliserNom(undefined as unknown as string)).toBe("");
  });
});

describe("nettoyerNom", () => {
  it("réduit les espaces mais garde la casse et les accents", () => {
    expect(nettoyerNom("  Aïssatou   Ndiaye ")).toBe("Aïssatou Ndiaye");
  });
});

describe("normaliserTelephone", () => {
  it.each([
    ["771234567", "771234567"],
    ["77 123 45 67", "771234567"],
    ["77-123-45-67", "771234567"],
    ["+221 77 123 45 67", "771234567"],
    ["00221771234567", "771234567"],
    ["221771234567", "771234567"],
  ])("« %s » → %s", (brut, attendu) => {
    expect(normaliserTelephone(brut)).toBe(attendu);
  });

  it.each(["77123456", "7712345678", "", "abc", "+33 6 12 34 56 78"])("refuse « %s »", (brut) => {
    expect(normaliserTelephone(brut)).toBeNull();
  });
});

describe("formaterTelephone", () => {
  it("affiche 77 123 45 67", () => {
    expect(formaterTelephone("771234567")).toBe("77 123 45 67");
  });
});
