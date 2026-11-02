import { describe, expect, it } from "vitest";
import { plusPetitOrdreLibre } from "@/lib/ordre";

describe("plusPetitOrdreLibre", () => {
  it.each([
    [[], 1],
    [[1, 2, 3], 4],
    [[1, 2, 4], 3], // un ordre libéré par un membre retiré
    [[2, 3], 1],
    [[1, null, 2], 3], // les membres sans ordre sont ignorés
  ])("%j → %i", (ordres, attendu) => {
    expect(plusPetitOrdreLibre(ordres)).toBe(attendu);
  });
});
