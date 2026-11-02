import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyserImport, comparerAvecFiche, lignesACompleter, resumer, type PersonneExistante } from "@/lib/import/analyse";
import { detecterColonnes, extraireLignes, lireCanal, lireTableau, lireVerse } from "@/lib/import/tableau";

// [R] = tableau Word fictif, même structure que celui de la trésorière (tests/fixtures/import/word.txt), [F] = fictif.
const WORD = readFileSync(fileURLToPath(new URL("./fixtures/import/word.txt", import.meta.url)), "utf8");

function lire(texte: string) {
  const tableau = lireTableau(texte);
  const detection = detecterColonnes(tableau);
  return { tableau, detection, ...extraireLignes(tableau, detection) };
}

// Le tableau Word avec une colonne « Téléphone » ajoutée (ce que la trésorière prévoit).
const WORD_AVEC_TELEPHONE = WORD.split("\r\n")
  .map((ligne, i) => {
    if (ligne.includes("Prénom")) return ligne.replace("Cellule", "Téléphone\tCellule");
    const n = /^\t(\d+)\t/.exec(ligne)?.[1];
    if (!n || i === 0) return ligne;
    const cellules = ligne.split("\t");
    cellules.splice(4, 0, `77 000 00 ${n.padStart(2, "0")}`);
    return cellules.join("\t");
  })
  .join("\r\n");

describe("[R] tableau Word (structure réelle, noms inventés)", () => {
  const r = lire(WORD);

  it("détecte la tabulation et retire les colonnes vides des bords du tableau", () => {
    expect(r.tableau.separateur).toBe("tabulation");
    expect(r.tableau.lignes[0].cellules).toEqual(["N°", "Prénom", "Nom", "Cellule", "Montant"]);
  });

  it("reconnaît les colonnes par l'en-tête ; Cellule est lue (phase 10), Montant (somme convenue) ignoré", () => {
    expect(r.detection).toEqual({ ligneEnTete: 0, roles: ["ordre", "prenom", "nom", "cellule", "ignorer"] });
  });

  it("lit 22 membres, assemble Prénom + Nom, garde les majuscules", () => {
    expect(r.lues).toHaveLength(22);
    expect(r.lues[0]).toEqual({ numero: 2, nom: "Ami KLDY", telephoneSaisi: "", ordreSaisi: "1", celluleSaisie: "Organisation", verseSaisi: "", canalSaisi: "" });
    expect(r.lues[7].nom).toBe("Mame xyz WADE");
    expect(r.lues[21]).toMatchObject({ nom: "Xyz M", ordreSaisi: "22" });
  });

  it("écarte la ligne de total", () => {
    // Ligne 25 du fichier : en-tête (1), 22 membres (2 à 23), une ligne vide (24), le total (25).
    expect(r.ecartees).toEqual([{ numero: 25, texte: "Montant Total · 44 000 FCFA", raison: "Ligne de total" }]);
  });

  it("dans une tontine vide : 22 nouvelles personnes, ordres 1 à 22 repris du N°", () => {
    const lignes = analyserImport(r.lues, [], { type: "TONTINE", ordresPris: [] });
    expect(resumer(lignes)).toMatchObject({ total: 22, aImporter: 22, nouvelles: 22, erreurs: 0 });
    expect(lignes.map((l) => l.ordre)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(lignes.every((l) => l.telephone === null)).toBe(true);
  });

  it("dans une collecte : le N° est ignoré (aucun ordre de passage)", () => {
    const lignes = analyserImport(r.lues, [], { type: "COLLECTE", ordresPris: [] });
    expect(lignes.every((l) => l.ordre === null)).toBe(true);
  });
});

describe("[R+F] le même tableau avec une colonne « Téléphone » ajoutée", () => {
  const r = lire(WORD_AVEC_TELEPHONE);

  it("reconnaît la colonne Téléphone", () => {
    expect(r.detection.roles).toEqual(["ordre", "prenom", "nom", "telephone", "cellule", "ignorer"]);
  });

  it("normalise les numéros", () => {
    const lignes = analyserImport(r.lues, [], { type: "TONTINE", ordresPris: [] });
    expect(lignes[0].telephone).toBe("770000001");
    expect(resumer(lignes).nouvelles).toBe(22);
  });
});

describe("[F] autres formats de liste", () => {
  it.each([
    ["point-virgule", "Awa Diop;77 123 45 67;1\nCheikh Ndour;781112233;2"],
    ["virgule", "Awa Diop,77 123 45 67,1\nCheikh Ndour,781112233,2"],
  ])("sans en-tête, séparateur %s : nom ; numéro ; ordre (cahier)", (_cas, texte) => {
    const r = lire(texte);
    expect(r.detection).toEqual({ ligneEnTete: null, roles: ["nomComplet", "telephone", "ordre"] });
    expect(r.lues[0]).toMatchObject({ nom: "Awa Diop", telephoneSaisi: "77 123 45 67", ordreSaisi: "1" });
  });

  it("sans en-tête, colonnes ordre et numéro inversées : tranché par le contenu", () => {
    expect(lire("Awa Diop;1;771234567").detection.roles).toEqual(["nomComplet", "ordre", "telephone"]);
  });

  it("en-tête ambigu « Numéro » : téléphone si la colonne contient des numéros, ordre sinon", () => {
    expect(lire("Nom;Numéro\nAwa;771234567").detection.roles).toEqual(["nom", "telephone"]);
    expect(lire("Nom;Numéro\nAwa;3").detection.roles).toEqual(["nom", "ordre"]);
  });

  it("une seule colonne de nom complet suffit", () => {
    const r = lire("Membre\nAwa Diop\nCheikh Ndour");
    expect(r.lues.map((l) => l.nom)).toEqual(["Awa Diop", "Cheikh Ndour"]);
  });

  it("ignore les lignes vides et les guillemets d'export", () => {
    const r = lire('"Awa Diop";"771234567"\n\n  \n"Cheikh Ndour";"781112233"');
    expect(r.lues.map((l) => l.nom)).toEqual(["Awa Diop", "Cheikh Ndour"]);
  });

  it("texte vide : rien à importer, sans exception", () => {
    expect(lire("").lues).toEqual([]);
  });
});

describe("[F] classement des lignes", () => {
  const awa: PersonneExistante = { id: "awa", nomComplet: "Awa Diop", aliasWave: [], numeros: ["771234567"] };
  const awa2: PersonneExistante = { id: "awa2", nomComplet: "Awa Diop", aliasWave: [], numeros: ["700000001"] };
  const moussa: PersonneExistante = { id: "moussa", nomComplet: "Cheikh Ndour", aliasWave: [], numeros: ["781112233"], membre: { statut: "ACTIF" } };
  const fatou: PersonneExistante = { id: "fatou", nomComplet: "Fatou Kane", aliasWave: [], numeros: ["761230002"], membre: { statut: "INACTIF" } };
  const tontine = { type: "TONTINE" as const, ordresPris: [1, 2] };
  const lues = (lignes: [string, string?, string?][]) =>
    lignes.map(([nom, tel = "", ordre = ""], i) => ({ numero: i + 1, nom, telephoneSaisi: tel, ordreSaisi: ordre }));

  it("même numéro qu'une personne : réutilisée automatiquement (personne partagée)", () => {
    const [l] = analyserImport(lues([["A. Diop", "77 123 45 67"]]), [awa], tontine);
    expect(l).toMatchObject({ statut: "existante", personneId: "awa", ordre: 3 });
  });

  it("même nom, sans numéro commun : à choisir (homonymes possibles)", () => {
    const [l] = analyserImport(lues([["awa  DIOP"]]), [awa, awa2], tontine);
    expect(l.statut).toBe("a_choisir");
    expect(l.candidats.map((c) => c.id)).toEqual(["awa", "awa2"]);
  });

  it("le choix de la trésorière tranche : réutiliser ou créer", () => {
    const l = lues([["Awa Diop"]]);
    expect(analyserImport(l, [awa, awa2], tontine, { 1: "awa2" })[0]).toMatchObject({ statut: "existante", personneId: "awa2" });
    expect(analyserImport(l, [awa, awa2], tontine, { 1: "creer" })[0].statut).toBe("nouvelle");
  });

  it("un choix qui n'est pas parmi les candidats est ignoré", () => {
    expect(analyserImport(lues([["Awa Diop"]]), [awa, awa2], tontine, { 1: "moussa" })[0].statut).toBe("a_choisir");
  });

  it("déjà membre actif : ignorée ; membre inactif : réactivé sans ordre", () => {
    const lignes = analyserImport(lues([["Cheikh Ndour", "781112233"], ["Fatou Kane", "761230002"]]), [moussa, fatou], tontine);
    expect(lignes.map((l) => l.statut)).toEqual(["deja_membre", "reactivation"]);
    expect(lignes[1].ordre).toBeNull();
  });

  it("numéro illisible, ou doublon à l'intérieur de la liste : erreur", () => {
    const lignes = analyserImport(
      lues([["Awa", "7712"], ["Coumba Sène", "761234567"], ["coumba sene"], ["Ndeye Fall", "761234567"]]),
      [],
      tontine,
    );
    expect(lignes.map((l) => l.statut)).toEqual(["erreur", "nouvelle", "erreur", "erreur"]);
    expect(lignes[2].messages).toEqual(["Même nom qu'à la ligne 2, sans numéro ni cellule différents."]);
    expect(lignes[3].messages).toEqual(["Même numéro qu'à la ligne 2."]);
  });

  it("ordre déjà pris : importé sans ordre ; les lignes sans ordre suivent les existants", () => {
    const lignes = analyserImport(lues([["Coumba", "", "2"], ["Ndeye", "", "5"], ["Astou"], ["Binta"]]), [], tontine);
    expect(lignes.map((l) => l.ordre)).toEqual([null, 5, 6, 7]);
    expect(lignes[0].messages).toEqual(["Ordre 2 déjà pris : importé sans ordre."]);
  });

  it("deux lignes ne peuvent pas désigner la même personne existante", () => {
    const lignes = analyserImport(lues([["Awa Diop", "771234567"], ["A Diop", "77 123 45 67"]]), [awa], tontine);
    expect(lignes[1].statut).toBe("erreur");
  });
});

// ─── Phase 10 : colonnes Cellule et Versé ────────────────────────────────────

describe("lireVerse", () => {
  it.each([
    ["2 000", 2000],
    ["2.000", 2000],
    ["2000 F", 2000],
    ["2 000 FCFA", 2000],
    ["1 500", 1500],
    ["", 0],
    ["0", 0],
    ["-", 0],
  ])("« %s » → %s", (texte, attendu) => expect(lireVerse(texte)).toBe(attendu));

  it.each(["deux mille", "2,5", "oui"])("« %s » est illisible", (texte) => expect(lireVerse(texte)).toBeNull());
});

describe("[F] tableau collecte avec Cellule et Versé", () => {
  const TEXTE = [
    "N°\tPrénom\tNom\tCellule\tTéléphone\tMontant\tVersé",
    "1\tKhady\tDiop\tOrganisation\t77 123 45 67\t2 000\t2 000",
    "2\tCheikh\tNdour\tTechnique\t781112233\t2 000\t",
    "3\tAïda\tSow\tTechnique\t\t2 000\t500",
    "4\tFatou\tKane\t Organisation \t761230002\t2 000\tbeaucoup",
  ].join("\n");
  const r = lire(TEXTE);
  const moussa: PersonneExistante = { id: "moussa", nomComplet: "Cheikh Ndour", aliasWave: [], numeros: ["781112233"], membre: { statut: "ACTIF" } };

  it("détecte Cellule et Versé ; « Montant » (somme convenue) reste ignoré", () => {
    expect(r.detection.roles).toEqual(["ordre", "prenom", "nom", "cellule", "telephone", "ignorer", "verse"]);
  });

  it("garde la cellule et le versé de chaque ligne, membre déjà inscrit compris", () => {
    const lignes = analyserImport(r.lues, [moussa], { type: "COLLECTE", ordresPris: [], cycleOuvert: true });
    expect(lignes.map((l) => [l.nom, l.cellule, l.verse, l.statut])).toEqual([
      ["Khady Diop", "Organisation", 2000, "nouvelle"],
      ["Cheikh Ndour", "Technique", null, "deja_membre"],
      ["Aïda Sow", "Technique", 500, "nouvelle"],
      ["Fatou Kane", "Organisation", null, "nouvelle"],
    ]);
    expect(lignes[3].messages).toContain("Versé illisible « beaucoup » : ignoré.");
    expect(resumer(lignes)).toMatchObject({ verses: 2, totalVerse: 2500 });
  });

  it("sans cycle ouvert, le versé est ignoré avec un avertissement", () => {
    const lignes = analyserImport(r.lues, [], { type: "COLLECTE", ordresPris: [] });
    expect(lignes.every((l) => l.verse === null)).toBe(true);
    expect(lignes[0].messages).toContain("Pas de cycle ouvert : versé ignoré.");
  });

  it("échéance déjà payée dans Cotiz : le versé n'est pas compté deux fois (réimport)", () => {
    const texte = TEXTE.replace("781112233\t2 000\t", "781112233\t2 000\t2 000");
    const lignes = analyserImport(lire(texte).lues, [moussa], { type: "COLLECTE", ordresPris: [], cycleOuvert: true, dejaPayees: ["moussa"] });
    expect(lignes[1]).toMatchObject({ statut: "deja_membre", verse: null });
    expect(lignes[1].messages).toContain("Déjà un paiement dans Cotiz : versé ignoré.");
  });

  it("une ligne en erreur n'enregistre pas de versé", () => {
    const texte = TEXTE + "\n5\tKhady\tDiop\tOrganisation\t\t2 000\t2 000";
    const lignes = analyserImport(lire(texte).lues, [], { type: "COLLECTE", ordresPris: [], cycleOuvert: true });
    expect(lignes[4]).toMatchObject({ statut: "erreur", verse: null });
  });
});

describe("[F] colonne Canal : chaque versé garde son moyen de paiement", () => {
  const TEXTE = [
    "Prénom\tNom\tTéléphone\tVersé\tMoyen de paiement",
    "Khady\tDiop\t771234567\t2 000\tWave",
    "Aïda\tSow\t781112233\t2 000\tOM",
    "Fatou\tKane\t761230002\t2 000\tEspèces",
    "Cheikh\tNdour\t709998877\t2 000\t",
    "Awa\tFall\t705554433\t2 000\tchèque",
  ].join("\n");
  const r = lire(TEXTE);

  it("reconnaît l'en-tête « Moyen de paiement » ; « Wave » seul reste le numéro", () => {
    expect(r.detection.roles).toEqual(["prenom", "nom", "telephone", "verse", "canal"]);
    expect(lire("Nom\tWave\nAwa Diop\t771234567").detection.roles).toEqual(["nom", "telephone"]);
  });

  it("lit Wave, OM, espèces ; vide ou illisible → canal choisi pour l'import", () => {
    expect(lireCanal(" orange  money ")).toBe("ORANGE_MONEY");
    expect(lireCanal("Cash")).toBe("CASH");
    expect(lireCanal("")).toBeNull();
    expect(lireCanal("chèque")).toBe("illisible");
    const lignes = analyserImport(r.lues, [], { type: "COLLECTE", ordresPris: [], cycleOuvert: true });
    expect(lignes.map((l) => l.canal)).toEqual(["WAVE", "ORANGE_MONEY", "CASH", null, null]);
    expect(lignes[4].messages).toContain("Canal illisible « chèque » : celui choisi pour l'import.");
    expect(resumer(lignes)).toMatchObject({ verses: 5, versesSansCanal: 2 });
  });

  describe("réimport avec la colonne Canal ajoutée après coup", () => {
    // Aïda (OM dans la liste) et Khady (Wave) ont déjà un paiement repris d'un premier import, en Wave.
    const aida: PersonneExistante = { id: "aida", nomComplet: "Aïda Sow", aliasWave: [], numeros: ["781112233"], membre: { statut: "ACTIF" } };
    const khady: PersonneExistante = { id: "khady", nomComplet: "Khady Diop", aliasWave: [], numeros: ["771234567"], membre: { statut: "ACTIF" } };
    const contexte = (reprises: Record<string, { paiementId: string; canal: "WAVE" | "ORANGE_MONEY" | "CASH" }>) => ({
      type: "TONTINE" as const,
      ordresPris: [1, 2],
      cycleOuvert: true,
      dejaPayees: ["aida", "khady"],
      reprises,
    });

    it("canal différent sur un paiement repris d'un import : seul le canal est corrigé", () => {
      const lignes = analyserImport(r.lues, [aida, khady], contexte({ aida: { paiementId: "p-aida", canal: "WAVE" }, khady: { paiementId: "p-khady", canal: "WAVE" } }));
      const [l, k] = [lignes.find((x) => x.personneId === "aida")!, lignes.find((x) => x.personneId === "khady")!];
      expect(l).toMatchObject({ statut: "deja_membre", verse: null, correctionCanal: { paiementId: "p-aida", de: "WAVE", vers: "ORANGE_MONEY" } });
      expect(l.messages).toContain("Déjà repris d'un import : canal corrigé, Wave → Orange Money.");
      expect(k.correctionCanal).toBeUndefined(); // même canal : rien à corriger
      expect(k.messages).toContain("Déjà un paiement dans Cotiz : versé ignoré.");
      expect(resumer(lignes)).toMatchObject({ canauxCorriges: 1, versesSansCanal: 2 });
      expect(lignesACompleter(lignes).map((x) => x.personneId)).toContain("aida");
    });

    it("paiement venu d'un SMS ou d'une saisie (pas d'un import) : jamais modifié", () => {
      const lignes = analyserImport(r.lues, [aida, khady], contexte({}));
      expect(lignes.some((x) => x.correctionCanal)).toBe(false);
      expect(lignes.find((x) => x.personneId === "aida")?.messages).toContain("Déjà un paiement dans Cotiz : versé ignoré.");
    });
  });
});

describe("[F] réimport : reconnaissance par le nom et numéros (phase 10)", () => {
  const ligne = (nom: string, telephoneSaisi = "") => ({ numero: 2, nom, telephoneSaisi, ordreSaisi: "" });
  const collecte = { type: "COLLECTE" as const, ordresPris: [] };
  const awaMembre: PersonneExistante = { id: "awa", nomComplet: "Awa Diop", aliasWave: [], numeros: [], membre: { statut: "ACTIF" } };

  it("même nom qu'une seule personne déjà membre de la caisse : reconnue sans choix, numéro ajouté", () => {
    const [l] = analyserImport([ligne("Awa Diop", "77 123 45 67")], [awaMembre], collecte);
    expect(l).toMatchObject({ statut: "deja_membre", personneId: "awa", numeroAAjouter: true });
    expect(l.messages).toContain("Numéro ajouté à sa fiche.");
  });

  it("même nom mais pas membre de cette caisse : toujours à choisir (homonyme possible)", () => {
    const [l] = analyserImport([ligne("Awa Diop")], [{ ...awaMembre, membre: undefined }], collecte);
    expect(l.statut).toBe("a_choisir");
  });

  it("deux personnes du même nom : toujours à choisir, même si l'une est membre", () => {
    const homonyme: PersonneExistante = { id: "awa2", nomComplet: "Awa Diop", aliasWave: [], numeros: ["700000001"] };
    const [l] = analyserImport([ligne("Awa Diop")], [awaMembre, homonyme], collecte);
    expect(l.statut).toBe("a_choisir");
  });

  it("« la créer » choisi par la trésorière l'emporte sur la reconnaissance automatique", () => {
    const [l] = analyserImport([ligne("Awa Diop")], [awaMembre], collecte, { 2: "creer" });
    expect(l.statut).toBe("nouvelle");
    expect(l.personneId).toBeUndefined();
  });

  it("numéro déjà sur la fiche : rien à ajouter", () => {
    const [l] = analyserImport([ligne("Awa Diop", "771234567")], [{ ...awaMembre, numeros: ["771234567"] }], collecte);
    expect(l).toMatchObject({ statut: "deja_membre" });
    expect(l.numeroAAjouter).toBeUndefined();
  });
});

describe("[F] homonymes : numéro et cellule distinguent deux personnes (phase 10)", () => {
  const ligne = (numero: number, telephoneSaisi = "", celluleSaisie = "") => ({ numero, nom: "Awa Diop", telephoneSaisi, ordreSaisi: "", celluleSaisie });
  const collecte = { type: "COLLECTE" as const, ordresPris: [] };

  it("dans la liste : numéros différents → deux nouvelles personnes", () => {
    const lignes = analyserImport([ligne(2, "771111111"), ligne(3, "772222222")], [], collecte);
    expect(lignes.map((l) => l.statut)).toEqual(["nouvelle", "nouvelle"]);
  });

  it("dans la liste : cellules différentes, sans numéro → deux nouvelles personnes", () => {
    const lignes = analyserImport([ligne(2, "", "Technique"), ligne(3, "", "Organisation")], [], collecte);
    expect(lignes.map((l) => l.statut)).toEqual(["nouvelle", "nouvelle"]);
  });

  it("dans la liste : rien ne les distingue → erreur (sans doute la même personne écrite deux fois)", () => {
    const lignes = analyserImport([ligne(2, "", "Technique"), ligne(3, "", "technique")], [], collecte);
    expect(lignes[1]).toMatchObject({ statut: "erreur", messages: ["Même nom qu'à la ligne 2, sans numéro ni cellule différents."] });
  });

  const awaMembre: PersonneExistante = { id: "awa", nomComplet: "Awa Diop", aliasWave: [], numeros: ["771111111"], cellule: "Technique", membre: { statut: "ACTIF" } };

  it("homonyme déjà membre, autre numéro : pas de fusion, à choisir avec explication", () => {
    const [l] = analyserImport([ligne(2, "772222222")], [awaMembre], collecte);
    expect(l.statut).toBe("a_choisir");
    expect(l.messages[0]).toMatch(/sans doute une autre personne/);
    const [creee] = analyserImport([ligne(2, "772222222")], [awaMembre], collecte, { 2: "creer" });
    expect(creee.statut).toBe("nouvelle");
  });

  it("homonyme déjà membre, autre cellule : pas de fusion", () => {
    const [l] = analyserImport([ligne(2, "", "Organisation")], [awaMembre], collecte);
    expect(l.statut).toBe("a_choisir");
  });

  it("les deux homonymes dans la même liste : l'un retrouvé par son numéro, l'autre à créer", () => {
    const lignes = analyserImport([ligne(2, "771111111", "Technique"), ligne(3, "772222222", "Organisation")], [awaMembre], collecte, { 3: "creer" });
    expect(lignes.map((l) => [l.statut, l.personneId])).toEqual([
      ["deja_membre", "awa"],
      ["nouvelle", undefined],
    ]);
  });

  it("même cellule et pas de numéro sur la ligne : reconnue sans choix (réimport)", () => {
    const [l] = analyserImport([ligne(2, "", "Technique")], [awaMembre], collecte);
    expect(l).toMatchObject({ statut: "deja_membre", personneId: "awa" });
  });
});

describe("comparerAvecFiche : ce qui rapproche ou distingue une ligne d'une fiche", () => {
  it("numéro et cellule identiques, différents, ou rien à comparer", () => {
    const fiche = { numeros: ["771111111", "781111111"], cellule: "Technique" };
    expect(comparerAvecFiche({ telephone: "781111111", cellule: "technique" }, fiche)).toEqual({ numero: "identique", cellule: "identique" });
    expect(comparerAvecFiche({ telephone: "772222222", cellule: "Organisation" }, fiche)).toEqual({ numero: "different", cellule: "different" });
    expect(comparerAvecFiche({ telephone: null, cellule: null }, fiche)).toEqual({ numero: "inconnu", cellule: "inconnu" });
    expect(comparerAvecFiche({ telephone: "772222222", cellule: "Technique" }, { numeros: [], cellule: null })).toEqual({ numero: "inconnu", cellule: "inconnu" });
  });

  it("chaque personne proposée porte sa fiche et la comparaison", () => {
    const awa: PersonneExistante = { id: "awa", nomComplet: "Awa Diop", aliasWave: [], numeros: ["771111111"], cellule: "Technique", membre: { statut: "ACTIF" } };
    const [l] = analyserImport([{ numero: 2, nom: "Awa Diop", telephoneSaisi: "772222222", ordreSaisi: "", celluleSaisie: "Organisation" }], [awa], { type: "COLLECTE", ordresPris: [] });
    expect(l.candidats[0]).toMatchObject({
      id: "awa",
      numeros: ["771111111"],
      cellule: "Technique",
      membreDeLaCaisse: true,
      comparaison: { numero: "different", cellule: "different" },
    });
  });
});
