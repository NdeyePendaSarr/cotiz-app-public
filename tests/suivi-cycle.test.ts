import { describe, expect, it } from "vitest";
import { calculerSuivi, construireRecap, resumerCycle, situationEcheance, totauxParCellule, trierSuivi, type EcheanceSuivie } from "@/lib/suivi/cycle";

const echeance = new Date("2026-11-05T00:00:00.000Z");
const avant = new Date("2026-11-01T00:00:00.000Z");
const apres = new Date("2026-11-06T00:00:00.000Z");
const espaces = (t: string) => t.replace(/[  ]/g, " ");

const E = (nom: string, ordre: number | null, paye: number, autres: Partial<EcheanceSuivie> = {}): EcheanceSuivie => ({
  membreId: nom,
  personneId: nom,
  nom,
  ordre,
  membreActif: true,
  numeros: [],
  montantDu: 10_000,
  paye,
  arriere: 0,
  ...autres,
});

// Situation du seed (tontine mensuelle) en miniature : un payé, un en trop, un rien, un partiel.
const echeances = [
  E("Moussa Sarr", 1, 10_000),
  E("Aminata Ndiaye", 2, 10_000),
  E("Fatou Kane", 3, 0, { arriere: 2_000 }),
  E("Ibrahima Ba", 4, 4_000),
  E("Coumba Retirée", 5, 3_000, { membreActif: false }),
];

describe("calculerSuivi : statuts justes", () => {
  const s = calculerSuivi(echeances, echeance, avant);

  it("statut de chaque membre : payé, en attente, partiel", () => {
    expect(s.actifs.map((l) => [l.nom, l.statut, l.reste])).toEqual([
      ["Moussa Sarr", "PAYE", 0],
      ["Aminata Ndiaye", "PAYE", 0],
      ["Fatou Kane", "EN_ATTENTE", 10_000],
      ["Ibrahima Ba", "PARTIEL", 6_000],
    ]);
  });

  it("membre retiré : à part, seul ce qu'il a versé compte (ni reste, ni statut dans les totaux)", () => {
    expect(s.retires.map((l) => [l.nom, l.statut, l.reste, l.aJour, l.enRetard])).toEqual([["Coumba Retirée", "PARTIEL", 0, true, false]]);
    expect(s.totaux).toEqual({ attendu: 43_000, recu: 27_000, reste: 16_000, payes: 2, partiels: 1, enAttente: 1, membres: 4 });
  });

  it("arriérés de toute la caisse : un membre retiré sans ligne sur ce cycle compte encore", () => {
    expect(calculerSuivi(echeances, echeance, avant, 7_000).totalArrieres).toBe(7_000);
  });

  it("arriérés : à part, jamais dans les totaux du cycle", () => {
    expect(s.totalArrieres).toBe(2_000);
    expect(s.totaux.attendu).toBe(43_000);
  });

  it("le reçu ne compte pas au-delà du dû (l'excédent est à rembourser, ailleurs)", () => {
    expect(calculerSuivi([E("Trop", 1, 12_000)], echeance, avant).totaux.recu).toBe(10_000);
  });

  it("« en retard » seulement après l'échéance, et jamais pour qui est à jour", () => {
    expect(calculerSuivi(echeances, echeance, avant).actifs.some((l) => l.enRetard)).toBe(false);
    expect(calculerSuivi(echeances, echeance, apres).actifs.filter((l) => l.enRetard).map((l) => l.nom)).toEqual(["Fatou Kane", "Ibrahima Ba"]);
  });
});

describe("trierSuivi", () => {
  const { actifs } = calculerSuivi([...echeances, E("Sans Ordre", null, 0)], echeance, avant);
  const noms = (critere: Parameters<typeof trierSuivi>[1]) => trierSuivi(actifs, critere).map((l) => l.nom);

  it("par ordre de passage, sans ordre en dernier", () => {
    expect(noms("ordre")).toEqual(["Moussa Sarr", "Aminata Ndiaye", "Fatou Kane", "Ibrahima Ba", "Sans Ordre"]);
  });
  it("par statut : rien versé, puis partiel, puis payé", () => {
    expect(noms("statut")).toEqual(["Fatou Kane", "Sans Ordre", "Ibrahima Ba", "Moussa Sarr", "Aminata Ndiaye"]);
  });
  it("par reste dû, du plus grand au plus petit", () => {
    expect(noms("reste").slice(0, 3)).toEqual(["Fatou Kane", "Sans Ordre", "Ibrahima Ba"]);
  });
  it("par nom (ordre alphabétique français)", () => {
    expect(noms("nom")[0]).toBe("Aminata Ndiaye");
  });
  it("par versé, du plus grand au plus petit", () => {
    const tries = trierSuivi(actifs, "verse");
    expect(tries.map((l) => l.paye)).toEqual([...actifs.map((l) => l.paye)].sort((a, b) => b - a));
  });
  it("par cellule : sans cellule en dernier, puis par nom", () => {
    const avecCellules = actifs.map((l, i) => ({ ...l, cellule: i % 2 === 0 ? null : i === 1 ? "Technique" : "Organisation" }));
    const tries = trierSuivi(avecCellules, "cellule");
    expect(tries.map((l) => l.cellule)).toEqual(["Organisation", "Technique", null, null, null]);
    expect(tries.slice(2).map((l) => l.nom)).toEqual([...tries.slice(2).map((l) => l.nom)].sort((a, b) => a.localeCompare(b, "fr")));
  });
});

describe("construireRecap", () => {
  const s = calculerSuivi(echeances, echeance, avant);
  const contexte = { caisse: "Tontine mensuelle des amies", cycle: 1, dateEcheance: echeance };

  it("détaillé : nombre à jour + qui doit encore combien (jamais un membre retiré)", () => {
    expect(espaces(construireRecap(s, contexte, "detaille"))).toBe(
      [
        "Tontine mensuelle des amies, cycle 1 (échéance le 5 novembre 2026)",
        "À jour : 2 sur 4",
        "",
        "Reste à verser :",
        "- Fatou Kane : 10 000 FCFA",
        "- Ibrahima Ba : 6 000 FCFA",
      ].join("\n"),
    );
  });

  it("totaux seulement : aucun nom", () => {
    const texte = espaces(construireRecap(s, contexte, "totaux"));
    expect(texte).toBe(
      [
        "Tontine mensuelle des amies, cycle 1 (échéance le 5 novembre 2026)",
        "À jour : 2 sur 4",
        "Partiels : 1, rien versé : 1",
        "Reçu : 27 000 FCFA sur 43 000 FCFA (reste 16 000 FCFA)",
      ].join("\n"),
    );
    expect(texte).not.toContain("Fatou");
  });

  it("détaillé, tout le monde à jour", () => {
    const tousPayes = calculerSuivi([E("A", 1, 10_000), E("B", 2, 10_000)], echeance, avant);
    expect(construireRecap(tousPayes, contexte, "detaille")).toContain("Tout le monde est à jour");
  });
});

describe("resumerCycle (tableau de bord)", () => {
  const lignes = [
    { montantDu: 10_000, paye: 10_000, membreActif: true },
    { montantDu: 10_000, paye: 15_000, membreActif: true }, // trop-perçu : compte 10 000 dans le reçu
    { montantDu: 10_000, paye: 4_000, membreActif: true },
    { montantDu: 10_000, paye: 0, membreActif: true },
  ];

  it("reçu plafonné à l'attendu, membres pas à jour", () => {
    expect(resumerCycle(lignes, echeance, avant)).toEqual({ attendu: 40_000, recu: 24_000, membres: 4, pasAJour: 2, echeancePassee: false });
  });

  it("membre retiré : seul ce qu'il a versé est attendu, et il n'est jamais « pas à jour »", () => {
    expect(resumerCycle([...lignes, { montantDu: 10_000, paye: 3_000, membreActif: false }], echeance, avant)).toEqual({ attendu: 43_000, recu: 27_000, membres: 4, pasAJour: 2, echeancePassee: false });
  });

  it("échéance passée seulement après le jour de l'échéance", () => {
    expect(resumerCycle(lignes, echeance, echeance).echeancePassee).toBe(false);
    expect(resumerCycle(lignes, echeance, apres).echeancePassee).toBe(true);
  });

  it("cycle sans échéance", () => {
    expect(resumerCycle([], echeance, avant)).toEqual({ attendu: 0, recu: 0, membres: 0, pasAJour: 0, echeancePassee: false });
  });
});

describe("par cellule (phase 10)", () => {
  const avecCellules = calculerSuivi(
    [
      E("Awa", null, 2_000, { montantDu: 2_000, cellule: "Technique" }),
      E("Binta", null, 0, { montantDu: 2_000, cellule: "Organisation" }),
      E("Coumba", null, 3_000, { montantDu: 2_000, cellule: "Organisation" }), // trop-perçu
      E("Dior", null, 500, { montantDu: 2_000, cellule: "Technique" }),
      E("Elle", null, 0, { montantDu: 2_000 }),
    ],
    echeance,
    avant,
  );
  const contexte = { caisse: "Séminaire", cycle: 1, dateEcheance: echeance };

  it("totaux par cellule, « Sans cellule » en dernier, trop-perçu plafonné", () => {
    expect(totauxParCellule(avecCellules)).toEqual([
      { cellule: "Organisation", membres: 2, payes: 1, attendu: 4_000, recu: 2_000 },
      { cellule: "Technique", membres: 2, payes: 1, attendu: 4_000, recu: 2_500 },
      { cellule: "Sans cellule", membres: 1, payes: 0, attendu: 2_000, recu: 0 },
    ]);
  });

  it("aucune cellule renseignée : pas de totaux par cellule", () => {
    expect(totauxParCellule(calculerSuivi([E("A", 1, 0)], echeance, avant))).toEqual([]);
  });

  it("récap détaillé regroupé par cellule", () => {
    expect(espaces(construireRecap(avecCellules, contexte, "detaille"))).toBe(
      [
        "Séminaire, cycle 1 (échéance le 5 novembre 2026)",
        "À jour : 2 sur 5",
        "",
        "Reste à verser :",
        "",
        "Organisation (1)",
        "- Binta : 2 000 FCFA",
        "",
        "Technique (1)",
        "- Dior : 1 500 FCFA",
        "",
        "Sans cellule (1)",
        "- Elle : 2 000 FCFA",
      ].join("\n"),
    );
  });

  it("récap des totaux : une ligne par cellule", () => {
    expect(espaces(construireRecap(avecCellules, contexte, "totaux"))).toContain(
      ["Organisation : 1 à jour sur 2", "Technique : 1 à jour sur 2", "Sans cellule : 0 à jour sur 1"].join("\n"),
    );
  });
});

describe("mensualité : à jour et reste portent sur le dû à ce jour", () => {
  // 500 × 12 = 6 000 ; on est au 3e mois : 1 500 dus à ce jour, dont 1 000 pour les mois terminés.
  const mois3 = { montantDu: 6_000, exigible: 1_500, echu: 1_000 };
  const s = calculerSuivi([E("A", null, 1_500, mois3), E("B", null, 1_000, mois3), E("C", null, 500, mois3), E("D", null, 3_000, mois3)], echeance, apres);

  it("à jour dès que le dû à ce jour est versé ; en retard seulement pour les mois terminés", () => {
    expect(s.actifs.map((l) => [l.nom, l.statut, l.reste, l.enRetard])).toEqual([
      ["A", "PAYE", 0, false],
      ["B", "PARTIEL", 500, false],
      ["C", "PARTIEL", 1_000, true],
      ["D", "PAYE", 0, false],
    ]);
    expect(s.totaux).toMatchObject({ attendu: 24_000, recu: 6_000, payes: 2 });
  });

  it("avant le premier mois : « Pas commencée », à jour, sans reste ; versé d'avance : payé", () => {
    const avantDebut = calculerSuivi([E("A", null, 0, { montantDu: 6_000, exigible: 0, echu: 0 })], echeance, avant);
    expect(avantDebut.actifs[0]).toMatchObject({ statut: "A_VENIR", aJour: true, reste: 0, enRetard: false });
    expect(avantDebut.totaux).toMatchObject({ payes: 1, membres: 1 });
    expect(situationEcheance({ montantDu: 6_000, paye: 500, exigible: 0, membreActif: true })).toEqual({ statut: "PAYE", reste: 0, aJour: true });
  });

  it("fiche personne : à jour au 1er mois, pas « Reste 5 500 » ; membre retiré : plus de reste", () => {
    expect(situationEcheance({ montantDu: 6_000, paye: 500, exigible: 500, membreActif: true })).toEqual({ statut: "PAYE", reste: 0, aJour: true });
    expect(situationEcheance({ montantDu: 6_000, paye: 500, exigible: 500, membreActif: false })).toEqual({ statut: "PARTIEL", reste: 0, aJour: true });
  });

  it("tableau de bord : pas à jour d'après le dû à ce jour", () => {
    expect(resumerCycle([{ montantDu: 6_000, paye: 1_500, exigible: 1_500, membreActif: true }, { montantDu: 6_000, paye: 0, exigible: 1_500, membreActif: true }], echeance, avant).pasAJour).toBe(1);
  });
});
