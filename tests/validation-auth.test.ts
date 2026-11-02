import { describe, expect, it } from "vitest";
import { nomDepuisEmail, schemaConnexion } from "@/lib/validation/auth";

describe("schemaConnexion", () => {
  it("accepte une saisie valide et normalise l'e-mail", () => {
    const r = schemaConnexion.safeParse({ email: "  Awa.Diop@Exemple.SN ", motDePasse: "motdepasse" });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("awa.diop@exemple.sn");
  });

  it("refuse un e-mail invalide", () => {
    const r = schemaConnexion.safeParse({ email: "awa.diop", motDePasse: "motdepasse" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Adresse e-mail invalide.");
  });

  it("refuse un mot de passe de moins de 8 caractères", () => {
    const r = schemaConnexion.safeParse({ email: "awa@exemple.sn", motDePasse: "1234567" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Le mot de passe fait au moins 8 caractères.");
  });

  it("refuse des champs absents (formulaire trafiqué)", () => {
    const r = schemaConnexion.safeParse({ email: null, motDePasse: null });
    expect(r.success).toBe(false);
  });
});

describe("nomDepuisEmail", () => {
  it("prend la partie avant le @", () => {
    expect(nomDepuisEmail("ndeye.sarr@exemple.sn")).toBe("ndeye.sarr");
  });

  it("tronque à 100 caractères (taille de la colonne)", () => {
    expect(nomDepuisEmail(`${"a".repeat(150)}@exemple.sn`)).toHaveLength(100);
  });
});
