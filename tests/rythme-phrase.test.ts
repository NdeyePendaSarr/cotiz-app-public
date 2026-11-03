import { describe, expect, it } from "vitest";
import { phraseRythme } from "@/components/cotiz/graphiques";
import { formaterFCFA } from "@/lib/format";

// Retouches du 03/11/2026 : la phrase sous la jauge de rythme (collectes).

const base = { attendu: 160_000, recu: 27_000, attenduAujourdhui: 70_000, ecart: -43_000, necessaireParJour: 8_867, echeancePassee: false };

describe("phraseRythme", () => {
  it("en retard, en avance, pile : l'écart puis ce qu'il faut par jour", () => {
    expect(phraseRythme(base)).toBe(`En retard de ${formaterFCFA(43_000)} sur le rythme · il faut ${formaterFCFA(8_867)} par jour pour finir à temps`);
    expect(phraseRythme({ ...base, ecart: 5_000 })).toMatch(/^En avance de .* sur le rythme · il faut/);
    expect(phraseRythme({ ...base, ecart: 0 })).toMatch(/^Pile dans le rythme · il faut/);
  });

  it("tout reçu, ou échéance passée", () => {
    expect(phraseRythme({ ...base, recu: 160_000, necessaireParJour: 0 })).toBe("Tout est reçu.");
    expect(phraseRythme({ ...base, echeancePassee: true, necessaireParJour: 0 })).toBe(`Échéance passée : ${formaterFCFA(133_000)} restent à recevoir.`);
  });
});
