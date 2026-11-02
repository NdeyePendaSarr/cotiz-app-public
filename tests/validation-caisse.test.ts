import { describe, expect, it } from "vitest";
import { schemaCaisse, versChampsCaisse } from "@/lib/validation/caisse";

// Les valeurs arrivent du formulaire HTML : toujours des chaînes de caractères.
const tontine = { type: "TONTINE", nom: "Tontine des amies", montantCotisation: "10000", frequence: "MENSUELLE", jourEcheance: "5" };
const collecte = { type: "COLLECTE", nom: "Séminaire", montantCotisation: "5000", dateLimite: "2026-12-15" };

function premiereErreur(saisie: Record<string, unknown>) {
  const r = schemaCaisse.safeParse(saisie);
  return r.success ? null : { champ: r.error.issues[0].path[0], message: r.error.issues[0].message };
}

describe("schemaCaisse : tontine", () => {
  it("accepte une tontine mensuelle", () => {
    const r = schemaCaisse.parse(tontine);
    expect(r).toEqual({ ...tontine, montantCotisation: 10_000, jourEcheance: 5, modeleRelance: null });
  });

  it("modèle de relance : texte gardé, vide → null (modèle par défaut)", () => {
    expect(schemaCaisse.parse({ ...tontine, modeleRelance: "  Bonjour {nom}  " }).modeleRelance).toBe("Bonjour {nom}");
    expect(schemaCaisse.parse({ ...tontine, modeleRelance: "   " }).modeleRelance).toBeNull();
    expect(schemaCaisse.safeParse({ ...tontine, modeleRelance: "x".repeat(1001) }).success).toBe(false);
  });

  it.each(["25 000", "25.000", "25 000", " 25000 "])("lit le montant « %s » comme 25000", (saisie) => {
    expect(schemaCaisse.parse({ ...tontine, montantCotisation: saisie }).montantCotisation).toBe(25_000);
  });

  it.each([
    ["montant à 0", { montantCotisation: "0" }, "montantCotisation"],
    ["montant à virgule", { montantCotisation: "2500,5" }, "montantCotisation"],
    ["montant négatif", { montantCotisation: "-500" }, "montantCotisation"],
    ["nom vide", { nom: "   " }, "nom"],
    ["nom de 101 caractères", { nom: "a".repeat(101) }, "nom"],
    ["jour 32 (mensuelle)", { jourEcheance: "32" }, "jourEcheance"],
    ["jour 0", { jourEcheance: "0" }, "jourEcheance"],
    ["jour 8 (hebdomadaire)", { frequence: "HEBDOMADAIRE", jourEcheance: "8" }, "jourEcheance"],
    ["fréquence bimensuelle (masquée en v0)", { frequence: "BIMENSUELLE" }, "frequence"],
    ["fréquence absente", { frequence: undefined }, "frequence"],
  ])("refuse : %s", (_cas, modif, champ) => {
    expect(premiereErreur({ ...tontine, ...modif })?.champ).toBe(champ);
  });

  it("accepte une tontine hebdomadaire le dimanche (jour 7)", () => {
    const r = schemaCaisse.parse({ ...tontine, frequence: "HEBDOMADAIRE", jourEcheance: "7" });
    expect(r.type === "TONTINE" && r.jourEcheance).toBe(7);
  });
});

describe("schemaCaisse : collecte", () => {
  it("accepte une collecte et convertit la date limite à minuit UTC", () => {
    const r = schemaCaisse.parse(collecte);
    expect(r.type).toBe("COLLECTE");
    if (r.type === "COLLECTE") expect(r.dateLimite.toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });

  it.each([
    ["date absente", { dateLimite: "" }],
    ["date impossible", { dateLimite: "2026-02-31" }],
    ["date au mauvais format", { dateLimite: "15/12/2026" }],
  ])("refuse : %s", (_cas, modif) => {
    expect(premiereErreur({ ...collecte, ...modif })?.champ).toBe("dateLimite");
  });

  it("refuse un type inconnu", () => {
    expect(schemaCaisse.safeParse({ ...collecte, type: "EPARGNE" }).success).toBe(false);
  });
});

describe("versChampsCaisse", () => {
  it("une tontine n'a pas de date limite", () => {
    expect(versChampsCaisse(schemaCaisse.parse(tontine)).dateLimite).toBeNull();
  });

  it("une collecte n'a ni fréquence ni jour d'échéance", () => {
    const champs = versChampsCaisse(schemaCaisse.parse(collecte));
    expect(champs.frequence).toBeNull();
    expect(champs.jourEcheance).toBeNull();
  });
});
