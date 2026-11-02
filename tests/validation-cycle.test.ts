import { describe, expect, it } from "vitest";
import { schemaOuvertureCycle } from "@/lib/validation/cycle";

const premiereErreur = (saisie: Record<string, unknown>) => {
  const r = schemaOuvertureCycle.safeParse(saisie);
  return r.success ? null : { champ: r.error.issues[0].path[0], message: r.error.issues[0].message };
};

describe("schemaOuvertureCycle (premier cycle d'une tontine)", () => {
  it("accepte une reprise au 8e tour", () => {
    const r = schemaOuvertureCycle.parse({ numero: " 8 ", dateEcheance: "2026-11-05" });
    expect(r.numero).toBe(8);
    expect(r.dateEcheance.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it.each([
    ["numéro 0", { numero: "0" }, "numero", "Le numéro commence à 1."],
    ["numéro négatif", { numero: "-2" }, "numero", "Le numéro doit être un entier."],
    ["numéro décimal", { numero: "2.5" }, "numero", "Le numéro doit être un entier."],
    ["numéro vide", { numero: "" }, "numero", "Le numéro doit être un entier."],
    ["date vide", { dateEcheance: "" }, "dateEcheance", "Indique la date d'échéance."],
    ["date impossible", { dateEcheance: "2026-02-30" }, "dateEcheance", "Indique la date d'échéance."],
  ])("refuse : %s", (_cas, modif, champ, message) => {
    expect(premiereErreur({ numero: "1", dateEcheance: "2026-11-05", ...modif })).toEqual({ champ, message });
  });
});
