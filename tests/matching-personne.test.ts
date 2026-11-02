import { describe, expect, it } from "vitest";
import { identifierPersonne, type PersonneMatching } from "@/lib/matching/personne";
import { jaroWinkler, similariteNom } from "@/lib/matching/similarite";

// Personnes fictives, construites pour répondre aux noms Wave des SMS du fichier (même forme que les vrais)
// (« K Mbaye », « M Thiam », « rokh », « Abdou ndao », « Bay Mbengué », « Bou Ndaiye »).
const P = (id: string, nomComplet: string, numeros: string[] = [], aliasWave: string[] = []): PersonneMatching => ({ id, nomComplet, aliasWave, numeros });
const personnes = [
  P("khadim", "Khadim Mbaye", ["761112233"]),
  P("awa-mbaye", "Awa Mbaye"),
  P("khadim-sow", "Khadim Sow"),
  P("mamadou", "Mamadou Thiam"),
  P("moussa-thiam", "Moussa Thiam"),
  P("fatou-thiam", "Fatou Thiam"),
  P("rokhaya", "Rokhaya Sow"),
  P("abdoulaye", "Abdoulaye Ndao"),
  P("bay", "Bay Mbengue"),
  P("boubacar-ndiaye", "Boubacar Ndiaye"),
  P("khady", "Khady Ndiaye", ["771230001"], ["Khady Fall"]),
  P("mari", "Omar Ndiaye", ["781112244"]),
  P("epouse", "Aminata Ndiaye", ["781112244"]),
];
const ids = (r: ReturnType<typeof identifierPersonne>) => r.candidats.map((c) => c.id);
const paiement = (champs: { tel?: string; nom?: string; personneId?: string }) => ({
  telephoneExpediteur: champs.tel ?? null,
  nomExpediteur: champs.nom ?? null,
  personneId: champs.personneId ?? null,
});

describe("jaroWinkler", () => {
  it("1 pour deux mots identiques, 0 sans lettre commune", () => {
    expect(jaroWinkler("sarr", "sarr")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
  it("favorise un début commun (« abdou » / « abdoulaye »)", () => {
    expect(jaroWinkler("abdou", "abdoulaye")).toBeGreaterThan(0.85);
  });
});

describe("similariteNom", () => {
  it("une initiale vaut un prénom qui commence par elle", () => {
    expect(similariteNom("K Mbaye", "Khadim Mbaye")).toBe(1);
    expect(similariteNom("K Mbaye", "Awa Mbaye")).toBeLessThan(similariteNom("K Mbaye", "Khadim Mbaye"));
  });
  it("le nom de famille pèse plus que le prénom", () => {
    expect(similariteNom("K Mbaye", "Khadim Sow")).toBeLessThan(0.8);
  });
  it("un seul mot (« rokh ») marche quand même", () => {
    expect(similariteNom("rokh", "Rokhaya Sow")).toBeGreaterThan(0.8);
  });
  it("accents et casse ignorés", () => {
    expect(similariteNom("Bay Mbengué", "bay mbengue")).toBe(1);
  });
});

describe("identifierPersonne : tests obligatoires du cahier", () => {
  it("match par numéro (confiance haute, proposé d'office)", () => {
    const r = identifierPersonne(paiement({ tel: "771230001", nom: "n'importe quoi" }), personnes);
    expect(r.proposee).toBe("khady");
    expect(r.candidats[0]).toMatchObject({ confiance: "haute", raison: "numéro connu" });
  });

  it("match par alias (confiance moyenne)", () => {
    const r = identifierPersonne(paiement({ tel: "700000000", nom: "khady FALL" }), personnes);
    expect(r.proposee).toBe("khady");
    expect(r.candidats[0]).toMatchObject({ confiance: "moyenne", raison: "alias connu" });
  });

  it("nom avec accents et casse différents", () => {
    const r = identifierPersonne(paiement({ nom: "BAY MBENGUÉ" }), personnes);
    expect(r.proposee).toBe("bay");
    expect(r.candidats[0].confiance).toBe("moyenne");
  });

  it("aucune correspondance", () => {
    expect(identifierPersonne(paiement({ tel: "700000001", nom: "Xavier Zoubert" }), personnes)).toEqual({ proposee: null, candidats: [] });
    expect(identifierPersonne(paiement({}), personnes)).toEqual({ proposee: null, candidats: [] });
  });
});

describe("identifierPersonne : autres cas", () => {
  it("numéro partagé (couple) : il faut choisir entre les deux", () => {
    const r = identifierPersonne(paiement({ tel: "781112244" }), personnes);
    expect(r.proposee).toBeNull();
    expect(ids(r).sort()).toEqual(["epouse", "mari"]);
  });

  it("personne déjà choisie à la saisie manuelle : gardée", () => {
    expect(identifierPersonne(paiement({ personneId: "rokhaya", tel: "771230001" }), personnes).proposee).toBe("rokhaya");
  });

  it("le numéro passe avant le nom", () => {
    expect(identifierPersonne(paiement({ tel: "761112233", nom: "Rokhaya Sow" }), personnes).proposee).toBe("khadim");
  });
});

describe("noms proches : noms Wave des SMS du fichier (forme des vrais)", () => {
  it.each([
    ["K Mbaye", "khadim"],
    ["M Thiam", "mamadou"],
    ["rokh", "rokhaya"],
    ["Abdou ndao", "abdoulaye"],
    ["Bou Ndaiye", "boubacar-ndiaye"],
  ])("« %s » → %s parmi les suggestions (confiance basse, rien d'office)", (nom, attendu) => {
    const r = identifierPersonne(paiement({ nom }), personnes);
    expect(r.proposee).toBeNull();
    expect(ids(r)).toContain(attendu);
    expect(r.candidats.length).toBeLessThanOrEqual(3);
    expect(r.candidats.every((c) => c.confiance === "basse")).toBe(true);
  });

  it("« K Mbaye » : Khadim Mbaye en premier, pas Khadim Sow", () => {
    const r = identifierPersonne(paiement({ nom: "K Mbaye" }), personnes);
    expect(ids(r)[0]).toBe("khadim");
    expect(ids(r)).not.toContain("khadim-sow");
  });

  it("« M Thiam » : les Thiam en M d'abord, pas Fatou Thiam en tête", () => {
    const r = identifierPersonne(paiement({ nom: "M Thiam" }), personnes);
    expect(ids(r).slice(0, 2).sort()).toEqual(["mamadou", "moussa-thiam"]);
  });
});
