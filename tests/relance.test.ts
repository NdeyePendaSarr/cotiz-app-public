import { describe, expect, it } from "vitest";
import { construireMessage, fileDeRelance, lienWhatsApp, modeleParDefaut, phraseEnvoiWave } from "@/lib/relance";

const valeurs = { nom: "Awa Thiam", caisse: "Tontine hebdo", cycle: 8, montant: 2_000, reste: 1_500, echeance: new Date("2026-11-05T00:00:00.000Z") };
const espaces = (t: string) => t.replace(/[  ]/g, " ");

describe("construireMessage", () => {
  it("modèle par défaut : nom, caisse, cycle, cotisation, reste, date en toutes lettres et numéro Wave", () => {
    expect(espaces(construireMessage(modeleParDefaut("TONTINE", "771234567"), valeurs))).toBe(
      "Bonjour Awa Thiam, petit rappel pour la caisse « Tontine hebdo » (cycle 8) : il te reste 1 500 FCFA à verser sur 2 000 FCFA, avant le 5 novembre 2026. Tu peux l'envoyer par Wave au 77 123 45 67. Merci !",
    );
  });

  it("sans numéro Wave configuré (ou illisible) : la phrase d'envoi est retirée", () => {
    const attendu = "Bonjour Awa Thiam, petit rappel pour la caisse « Tontine hebdo » (cycle 8) : il te reste 1 500 FCFA à verser sur 2 000 FCFA, avant le 5 novembre 2026. Merci !";
    expect(espaces(construireMessage(modeleParDefaut("TONTINE", ""), valeurs))).toBe(attendu);
    expect(espaces(construireMessage(modeleParDefaut("TONTINE", "12"), valeurs))).toBe(attendu);
  });

  it("mensualité : ce qui est dû à ce jour, sans cycle ni date", () => {
    const mensualite = { ...valeurs, caisse: "Mensualité cellule", montant: 1_500, reste: 1_500, type: "MENSUALITE" as const };
    expect(espaces(construireMessage(null, mensualite))).toMatch(/^Bonjour Awa Thiam, petit rappel pour la mensualité « Mensualité cellule » : à ce jour, tu dois verser 1 500 FCFA./);
  });

  it("numéro Wave saisi avec indicatif ou espaces : remis au format lisible", () => {
    expect(phraseEnvoiWave("+221 77 123 45 67")).toBe(" Tu peux l'envoyer par Wave au 77 123 45 67.");
  });

  it("{montant} (cotisation) et {reste} (reste à verser) sont bien distincts", () => {
    expect(espaces(construireMessage("{montant} / {reste}", valeurs))).toBe("2 000 FCFA / 1 500 FCFA");
  });

  it("modèle propre à la caisse, balises répétées", () => {
    expect(construireMessage("{nom}, {nom} : {caisse}", valeurs)).toBe("Awa Thiam, Awa Thiam : Tontine hebdo");
  });

  it("une balise inconnue est laissée telle quelle", () => {
    expect(construireMessage("Salut {prenom}", valeurs)).toBe("Salut {prenom}");
  });

  it("modèle vide ou blanc → modèle par défaut", () => {
    expect(construireMessage("   ", valeurs)).toBe(construireMessage(modeleParDefaut(), valeurs));
  });

  it("« 1er » pour le premier du mois", () => {
    expect(construireMessage("{echeance}", { ...valeurs, echeance: new Date("2026-12-01T00:00:00.000Z") })).toBe("1er décembre 2026");
  });
});

describe("lienWhatsApp", () => {
  it("préfixe 221 et encode le message (espaces, accents, « », &)", () => {
    expect(lienWhatsApp("771234567", "Reste : 2 000 FCFA & merci « é »")).toBe(
      "https://wa.me/221771234567?text=Reste%20%3A%202%20000%20FCFA%20%26%20merci%20%C2%AB%20%C3%A9%20%C2%BB",
    );
  });

  it("refuse un numéro qui n'a pas 9 chiffres", () => {
    expect(lienWhatsApp("77123456", "x")).toBeNull();
  });
});

describe("{a_verser} : la phrase s'adapte à ce qui a été versé", () => {
  const modele = "Bonjour {nom}, petit rappel pour la « {caisse} » : {a_verser}, avant le {echeance}. Tu peux l'envoyer par Wave au 77 123 45 67. Merci !";
  const base = { nom: "Awa", caisse: "Séminaire 2026", cycle: 1, montant: 2_000, echeance: new Date("2026-11-01T00:00:00.000Z") };
  const espaces = (t: string) => t.replace(/[  ]/g, " ");

  it("rien versé : « tu dois verser »", () => {
    expect(espaces(construireMessage(modele, { ...base, reste: 2_000 }))).toBe(
      "Bonjour Awa, petit rappel pour la « Séminaire 2026 » : tu dois verser 2 000 FCFA, avant le 1er novembre 2026. Tu peux l'envoyer par Wave au 77 123 45 67. Merci !",
    );
  });

  it("une avance : « il te reste … à verser sur … »", () => {
    expect(espaces(construireMessage(modele, { ...base, reste: 1_500 }))).toBe(
      "Bonjour Awa, petit rappel pour la « Séminaire 2026 » : il te reste 1 500 FCFA à verser sur 2 000 FCFA, avant le 1er novembre 2026. Tu peux l'envoyer par Wave au 77 123 45 67. Merci !",
    );
  });
});

describe("message par défaut selon le type de caisse", () => {
  const v = { nom: "Awa", caisse: "Séminaire", cycle: 1, montant: 2_000, reste: 2_000, echeance: new Date("2026-11-01T00:00:00.000Z") };

  it("collecte : pas de cycle dans le message", () => {
    const texte = construireMessage(null, { ...v, type: "COLLECTE" });
    expect(texte).not.toMatch(/cycle/);
    expect(texte).toMatch(/^Bonjour Awa, petit rappel pour la « Séminaire » : tu dois verser/);
  });

  it("tontine (ou type absent) : le cycle reste", () => {
    expect(construireMessage(null, { ...v, type: "TONTINE" })).toMatch(/\(cycle 1\)/);
    expect(construireMessage(null, v)).toMatch(/\(cycle 1\)/);
  });
});

describe("fileDeRelance (relance en série)", () => {
  const ligne = (membreId: string, aJour: boolean, numeros: string[]) => ({ membreId, aJour, numeros });
  const lignes = [ligne("a", false, ["771111111"]), ligne("b", true, ["772222222"]), ligne("c", false, []), ligne("d", false, ["12"]), ligne("e", false, ["773333333"])];

  it("seulement les pas à jour avec un numéro valide, dans l'ordre ; compte ceux sans numéro", () => {
    const f = fileDeRelance(lignes, new Set());
    expect(f.restants.map((l) => l.membreId)).toEqual(["a", "e"]);
    expect(f).toMatchObject({ total: 2, sansNumero: 2 });
  });

  it("saute ceux déjà relancés aujourd'hui", () => {
    expect(fileDeRelance(lignes, new Set(["a"])).restants.map((l) => l.membreId)).toEqual(["e"]);
  });
});
