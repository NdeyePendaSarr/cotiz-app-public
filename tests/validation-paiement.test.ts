import { describe, expect, it } from "vitest";
import { estDansLeFutur, schemaPaiementManuel } from "@/lib/validation/paiement";

const base = { canal: "WAVE", montant: "2 000", date: "2026-10-27", heure: "16:15", personneId: "", reference: "", note: "" };

describe("schemaPaiementManuel", () => {
  it("assemble date et heure (Dakar = UTC) et lit le montant", () => {
    const r = schemaPaiementManuel.parse(base);
    expect(r).toMatchObject({ canal: "WAVE", montant: 2000, personneId: null, reference: null, note: null });
    expect(r.dateReception.toISOString()).toBe("2026-10-27T16:15:00.000Z");
  });

  it("référence Wave mise en majuscules (comme dans les SMS) pour l'anti-doublon", () => {
    expect(schemaPaiementManuel.parse({ ...base, reference: " tlyrdn5xxldg5avbh " }).reference).toBe("TLYRDN5XXLDG5AVBH");
  });

  it("pas de référence pour le cash, même si elle est saisie", () => {
    expect(schemaPaiementManuel.parse({ ...base, canal: "CASH", reference: "ABC" }).reference).toBeNull();
  });

  it("référence Orange Money gardée telle quelle", () => {
    expect(schemaPaiementManuel.parse({ ...base, canal: "ORANGE_MONEY", reference: "Om.123abc" }).reference).toBe("Om.123abc");
  });

  it.each([
    ["canal inconnu", { canal: "PAYPAL" }, "canal"],
    ["montant à 0", { montant: "0" }, "montant"],
    ["date vide", { date: "" }, "date"],
    ["heure invalide", { heure: "25:00" }, "heure"],
    ["personne invalide", { personneId: "pas-un-uuid" }, "personneId"],
  ])("refuse : %s", (_cas, modif, champ) => {
    const r = schemaPaiementManuel.safeParse({ ...base, ...modif });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe(champ);
  });
});

describe("estDansLeFutur", () => {
  const maintenant = new Date("2026-10-28T12:00:00.000Z");
  it("refuse une date future, tolère une minute d'écart", () => {
    expect(estDansLeFutur(new Date("2026-10-29T08:00:00.000Z"), maintenant)).toBe(true);
    expect(estDansLeFutur(new Date("2026-10-28T12:00:30.000Z"), maintenant)).toBe(false);
    expect(estDansLeFutur(new Date("2026-10-27T08:00:00.000Z"), maintenant)).toBe(false);
  });
});
