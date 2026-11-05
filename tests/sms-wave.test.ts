import { describe, expect, it } from "vitest";
import { parserSmsWave, retirerLigneSolde, type ResultatParsing } from "@/lib/parsers/smsWave";
import { chargerSmsFormatWave } from "./fixtures/sms/charger";
import { FICTIFS, smsReception } from "./fixtures/sms/fictifs";

// Source de chaque cas : [R] = SMS au format réel, données inventées (tests/fixtures/sms/format-wave.txt), [F] = fictif.

const SMS_FICHIER = chargerSmsFormatWave();

// Valeurs attendues pour les 9 SMS du fichier, dans l'ordre. Heure de Dakar = UTC.
const ATTENDUS_FICHIER = [
  { nom: "Coumba Faye", tel: "781112233", date: "2026-09-23T13:55:00.000Z", ref: "UB3LD64CZ8BF8CIT1", solde: "40.100" },
  { nom: "Abdou ndao", tel: "771112233", date: "2026-09-24T22:04:00.000Z", ref: "TZXK7PGRPJWNDGVQE", solde: "41.200" },
  { nom: "Bou Ndaiye", tel: "781112233", date: "2026-09-26T14:54:00.000Z", ref: "TYT7YIR0O97D9JB9O", solde: "42.300" },
  { nom: "K Mbaye", tel: "761112233", date: "2026-09-26T21:40:00.000Z", ref: "TSHVRZUGNWU4Q61QL", solde: "43.400" },
  { nom: "M Thiam", tel: "781112233", date: "2026-09-27T01:41:00.000Z", ref: "TN1FMAOHCFVVHI8Z0", solde: "44.500" },
  { nom: "A Diallo", tel: "701112233", date: "2026-09-27T12:34:00.000Z", ref: "T7GTH6NZ8QF8GZCLX", solde: "45.600" },
  { nom: "rokh", tel: "781112233", date: "2026-09-27T16:15:00.000Z", ref: "TLYRDN5XXLDG5AVBH", solde: "46.700" },
  { nom: "Bay Mbengué", tel: "761112233", date: "2026-09-27T21:21:00.000Z", ref: "TD905GNDMP954MZTA", solde: "47.800" },
  { nom: "Cheikh Ndour", tel: "781112233", date: "2026-09-28T00:22:00.000Z", ref: "TYDM6TAX86HYDYUMK", solde: "48.900" },
];

// Raccourci : vérifie ok: true et renvoie le résultat typé.
function lu(texte: string) {
  const r = parserSmsWave(texte);
  if (!r.ok) throw new Error(`Attendu ok: true, reçu ok: false (${r.raison})`);
  return r;
}

function refuse(texte: string) {
  const r = parserSmsWave(texte);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.raison.length).toBeGreaterThan(0);
  return r;
}

describe("fichier format-wave.txt", () => {
  it("[R] contient bien 9 SMS", () => {
    expect(SMS_FICHIER).toHaveLength(9);
  });
});

describe("SMS du fichier : tous les champs exacts", () => {
  // Cas 1 du cahier (SMS standard) + tests 2, 3, 4, 5, 6, 7 du plan.
  it.each(SMS_FICHIER.map((texte, i) => [i + 1, texte, ATTENDUS_FICHIER[i]] as const))(
    "[R] SMS n° %i",
    (_n, texte, attendu) => {
      const r = lu(texte);
      expect(r.montant).toBe(2000);
      expect(r.nomExpediteur).toBe(attendu.nom);
      expect(r.telephoneExpediteur).toBe(attendu.tel);
      expect(r.dateReception.toISOString()).toBe(attendu.date);
      expect(r.reference).toBe(attendu.ref);
      expect(r.champsManquants).toEqual([]);
    },
  );

  it("[R] les SMS du fichier ont bien des fins de ligne Windows (CRLF)", () => {
    expect(SMS_FICHIER[0]).toContain("\r\n");
  });

  it("[R] nom en minuscules gardé tel quel (rokh, Abdou ndao)", () => {
    expect(lu(SMS_FICHIER[6]).nomExpediteur).toBe("rokh");
    expect(lu(SMS_FICHIER[1]).nomExpediteur).toBe("Abdou ndao");
  });

  it("[R] double espace après « De » : « K Mbaye »", () => {
    expect(lu(SMS_FICHIER[3]).nomExpediteur).toBe("K Mbaye");
  });

  it("[R] accent conservé : « Bay Mbengué »", () => {
    expect(lu(SMS_FICHIER[7]).nomExpediteur).toBe("Bay Mbengué");
  });

  it("[R] heures 00h22 et 01h41 : pas de décalage de jour", () => {
    expect(lu(SMS_FICHIER[8]).dateReception.toISOString()).toBe("2026-09-28T00:22:00.000Z");
    expect(lu(SMS_FICHIER[4]).dateReception.toISOString()).toBe("2026-09-27T01:41:00.000Z");
  });
});

describe("le solde n'apparaît jamais (cas 7 du cahier)", () => {
  it.each(SMS_FICHIER.map((texte, i) => [i + 1, texte, ATTENDUS_FICHIER[i].solde] as const))(
    "[R] SMS n° %i",
    (_n, texte, solde) => {
      const resultat = JSON.stringify(parserSmsWave(texte));
      expect(resultat).not.toContain(solde); // « 40.100 »
      expect(resultat).not.toContain(solde.replace(".", "")); // « 40100 »
      expect(resultat.toLowerCase()).not.toContain("solde");
    },
  );
});

describe("formats à tolérer", () => {
  it("[F] nom en minuscules, numéro renvoyé à la ligne (cas 2)", () => {
    const r = lu(FICTIFS.numeroALaLigne);
    expect(r.nomExpediteur).toBe("moussa ndiaye");
    expect(r.telephoneExpediteur).toBe("771234567");
    expect(r.champsManquants).toEqual([]);
  });

  it("[F] petits et grands montants : 500F, 25.000F, 1.250.000F (cas 3)", () => {
    expect(lu(FICTIFS.montant500).montant).toBe(500);
    expect(lu(FICTIFS.montant25000).montant).toBe(25_000);
    expect(lu(FICTIFS.montant1250000).montant).toBe(1_250_000);
  });

  it("[F] copier-coller iPhone : espaces insécables, lignes vides, caractères invisibles (cas 4)", () => {
    const r = lu(FICTIFS.iphone);
    expect(r).toEqual({ ...lu(SMS_FICHIER[0]) });
  });

  it("[F] « reçu » avec cédille", () => {
    expect(lu(FICTIFS.avecCedille).montant).toBe(2000);
  });

  it("[F] « a » sans accent dans la date", () => {
    expect(lu(FICTIFS.aSansAccent).dateReception.toISOString()).toBe("2026-10-27T15:07:00.000Z");
  });

  it.each([
    ["+221", FICTIFS.numeroPlus221],
    ["00221 avec espaces", FICTIFS.numero00221],
    ["espaces", FICTIFS.numeroEspaces],
  ])("[F] numéro avec %s → 9 chiffres", (_cas, texte) => {
    expect(lu(texte).telephoneExpediteur).toBe("771234567");
  });
});

describe("champs facultatifs manquants : ok: true, champ à null", () => {
  it("[F] référence absente (cas 5)", () => {
    const r = lu(FICTIFS.sansReference);
    expect(r.reference).toBeNull();
    expect(r.champsManquants).toEqual(["reference"]);
    expect(r.montant).toBe(2000);
  });

  it("[F] numéro de 8 chiffres : téléphone null", () => {
    const r = lu(FICTIFS.numeroHuitChiffres);
    expect(r.telephoneExpediteur).toBeNull();
    expect(r.nomExpediteur).toBe("Moussa Ndiaye");
    expect(r.champsManquants).toEqual(["telephone"]);
  });

  it("[F] numéro absent : téléphone null, nom gardé", () => {
    const r = lu(FICTIFS.sansNumero);
    expect(r.telephoneExpediteur).toBeNull();
    expect(r.nomExpediteur).toBe("Moussa Ndiaye");
    expect(r.champsManquants).toEqual(["telephone"]);
  });

  it("[F] nom vide « De (771234567) » : nom null, numéro gardé", () => {
    const r = lu(smsReception({ ligneDe: "De (771234567)" }));
    expect(r.nomExpediteur).toBeNull();
    expect(r.telephoneExpediteur).toBe("771234567");
    expect(r.champsManquants).toEqual(["nom"]);
  });

  it("[F] ligne « De » absente : nom et téléphone null", () => {
    const r = lu(FICTIFS.sansLigneDe);
    expect(r.nomExpediteur).toBeNull();
    expect(r.telephoneExpediteur).toBeNull();
    expect(r.champsManquants).toEqual(["nom", "telephone"]);
    expect(r.reference).toBe("T4VKYYABCD12K7MOX");
  });
});

describe("refus : ok: false, sans exception", () => {
  const DATE_ILLISIBLE = "Date ou heure illisible.";
  const MONTANT_ILLISIBLE = "Montant illisible.";
  const PAS_UNE_RECEPTION = "Ce texte n'est pas un SMS de réception Wave.";
  const VIDE = "Le texte est vide.";

  it.each([
    ["date absente", FICTIFS.sansDate, DATE_ILLISIBLE],
    ["date impossible (31/02)", FICTIFS.dateImpossible, DATE_ILLISIBLE],
    ["heure impossible (25h70)", FICTIFS.heureImpossible, DATE_ILLISIBLE],
    ["montant nul", FICTIFS.montantNul, MONTANT_ILLISIBLE],
    ["montant illisible", FICTIFS.montantIllisible, MONTANT_ILLISIBLE],
  ])("[F] champ obligatoire : %s", (_cas, texte, raison) => {
    expect(refuse(texte)).toEqual({ ok: false, raison });
  });

  it.each([
    ["envoi d'argent (cas 6)", FICTIFS.envoi, PAS_UNE_RECEPTION],
    ["retrait", FICTIFS.retrait, PAS_UNE_RECEPTION],
    ["paiement marchand", FICTIFS.paiementMarchand, PAS_UNE_RECEPTION],
    ["message WhatsApp qui contient « reçu »", FICTIFS.messageWhatsApp, PAS_UNE_RECEPTION],
    ["texte vide", FICTIFS.vide, VIDE],
    ["espaces seulement", FICTIFS.espacesSeulement, VIDE],
  ])("[F] pas une réception : %s", (_cas, texte, raison) => {
    expect(refuse(texte)).toEqual({ ok: false, raison });
  });

  it("[R] deux SMS collés d'un coup", () => {
    const r = refuse(`${SMS_FICHIER[0]}\r\n\r\n${SMS_FICHIER[1]}`);
    if (!r.ok) expect(r.raison).toBe("2 SMS détectés, colle-les un par un");
  });

  it.each([
    ["texte très long", "x".repeat(200_000)],
    ["tirets seulement", "-".repeat(40)],
    ["emoji à la place du montant", "Vous avez recu 💸F\nDe ? (?)"],
    ["« F » sans chiffres", "Vous avez recu F"],
    ["valeur non textuelle", undefined as unknown as string],
    ["null", null as unknown as string],
  ])("[F] ne lève jamais d'exception : %s", (_cas, texte) => {
    let r: ResultatParsing | undefined;
    expect(() => {
      r = parserSmsWave(texte);
    }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("retirerLigneSolde", () => {
  it("[R] retire la ligne du solde et garde toutes les autres", () => {
    const sansSolde = retirerLigneSolde(SMS_FICHIER[0]);
    expect(sansSolde.toLowerCase()).not.toContain("solde");
    expect(sansSolde).not.toContain("40.100");
    for (const morceau of ["Vous avez recu 2.000F", "De Coumba Faye (781112233)", "23/09/2026 à 13h55", "UB3LD64CZ8BF8CIT1"]) {
      expect(sansSolde).toContain(morceau);
    }
  });

  it.each([
    ["sans espace après les deux-points", "Nouveau solde:9.500F"],
    ["espace insécable et espace avant les deux-points", "Nouveau solde : 9.500F"],
    ["en minuscules", "nouveau solde: 9.500F"],
  ])("[F] variante : %s", (_cas, ligneSolde) => {
    const sansSolde = retirerLigneSolde(smsReception({ solde: ligneSolde }));
    expect(sansSolde).not.toContain("9.500");
    expect(sansSolde).toContain("T4VKYYABCD12K7MOX");
  });

  it.each([
    ["Orange Money au format du cahier", "Vous avez recu un transfert de 5000.00FCFA de 770000009 Diallo. Ref:PP260415.0932.C48217 .Votre solde actuel est 87500.00 FCFA.Merci.OFMS", "87500", "PP260415.0932.C48217"],
    ["Wave collé sur une seule ligne", "Vous avez recu 5.000F De Awa (770000000) le 27/10/2026 a 15h07 Nouveau solde: 9.500F T4VKYYABCD12K7MOX", "9.500", "T4VKYYABCD12K7MOX"],
    ["valeur à la ligne suivante", "Vous avez recu 5.000F\nNouveau solde:\n9.500F\nT4VKYYABCD12K7MOX", "9.500", "T4VKYYABCD12K7MOX"],
    ["« Votre nouveau solde »", "Vous avez recu 5.000F\nVotre nouveau solde: 12 500 FCFA\nT4VKYYABCD12K7MOX", "12 500", "T4VKYYABCD12K7MOX"],
    ["« Solde : » seul", "Vous avez recu 5.000F\nSolde : 9.500F\nT4VKYYABCD12K7MOX", "9.500", "T4VKYYABCD12K7MOX"],
    ["caractère invisible dans le mot", "Vous avez recu 5.000F\nNouveau sol​de: 9.500F\nT4VKYYABCD12K7MOX", "9.500", "T4VKYYABCD12K7MOX"],
  ])("[F] solde retiré où qu'il soit : %s", (_cas, texte, solde, garde) => {
    const sansSolde = retirerLigneSolde(texte);
    expect(sansSolde).not.toContain(solde);
    expect(sansSolde.toLowerCase()).not.toContain("solde");
    expect(sansSolde).toContain(garde);
  });

  it("[F] Wave d'un bloc : la référence reste lisible après le retrait du solde", () => {
    const r = parserSmsWave("Vous avez recu 5.000F De Awa (770000000) le 27/10/2026 a 15h07 Nouveau solde: 9.500F T4VKYYABCD12K7MOX");
    expect(r).toMatchObject({ ok: true, montant: 5000, reference: "T4VKYYABCD12K7MOX" });
  });

  it.each([
    ["une date", "Nouveau solde:\n27/10/2026 à 15h07", "27/10/2026 à 15h07"],
    ["une référence qui commence par un chiffre", "Nouveau solde:\n4VKYYABCD12K7MOXA", "4VKYYABCD12K7MOXA"],
  ])("[F] libellé sans valeur : %s à la ligne suivante n'est pas prise pour un solde", (_cas, texte, garde) => {
    expect(retirerLigneSolde(texte).trim()).toBe(garde);
  });

  it("[F] un texte sans solde reste identique", () => {
    expect(retirerLigneSolde(FICTIFS.messageWhatsApp)).toBe(FICTIFS.messageWhatsApp);
  });

  it("[F] ne lève pas d'exception sur une valeur non textuelle", () => {
    expect(() => retirerLigneSolde(undefined as unknown as string)).not.toThrow();
  });
});
