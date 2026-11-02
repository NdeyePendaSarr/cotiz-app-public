import { describe, expect, it } from "vitest";
import { chercherDoublonsProbables, completerDepuisSms, type PaiementComparable } from "@/lib/capture/doublons";
import { preparerCaptureSms } from "@/lib/capture/sms";
import { chargerSmsReels } from "./fixtures/sms/charger";
import { FICTIFS } from "./fixtures/sms/fictifs";

const REELS = chargerSmsReels();

describe("preparerCaptureSms", () => {
  it("[R] SMS réel lisible → paiement, texte gardé SANS la ligne du solde", () => {
    const r = preparerCaptureSms(REELS[0]);
    expect(r.type).toBe("paiement");
    if (r.type !== "paiement") return;
    expect(r.donnees).toEqual({
      montant: 2000,
      nomExpediteur: "Coumba Faye",
      telephoneExpediteur: "781112233",
      dateReception: new Date("2026-09-23T13:55:00.000Z"),
      reference: "UB3LD64CZ8BF8CIT1",
    });
    expect(r.texteBrut.toLowerCase()).not.toContain("solde");
    expect(r.texteBrut).not.toContain("40.100");
    expect(r.texteBrut).toContain("UB3LD64CZ8BF8CIT1");
  });

  it("[F] référence absente → paiement quand même, champ signalé", () => {
    const r = preparerCaptureSms(FICTIFS.sansReference);
    expect(r).toMatchObject({ type: "paiement", champsManquants: ["reference"] });
  });

  it.each([
    ["message WhatsApp", FICTIFS.messageWhatsApp],
    ["date absente", FICTIFS.sansDate],
    ["envoi d'argent", FICTIFS.envoi],
  ])("[F] illisible (%s) → gardé dans SmsNonLu, sans le solde", (_cas, texte) => {
    const r = preparerCaptureSms(texte);
    expect(r.type).toBe("non_lu");
    if (r.type === "non_lu") expect(r.texteBrut.toLowerCase()).not.toContain("nouveau solde");
  });

  it.each([
    ["texte vide", ""],
    ["espaces seulement", "   \n  "],
    ["solde seul", "Nouveau solde: 9.500F"],
    ["valeur non textuelle", undefined],
  ])("[F] rien n'est enregistré : %s", (_cas, texte) => {
    expect(preparerCaptureSms(texte)).toEqual({ type: "refus", raison: "Colle d'abord un SMS." });
  });

  it("[R] 2 SMS collés d'un coup → refus, rien n'est enregistré", () => {
    expect(preparerCaptureSms(`${REELS[0]}\r\n${REELS[1]}`)).toEqual({ type: "refus", raison: "2 SMS détectés, colle-les un par un" });
  });
});

// Paiement saisi à la main le 27/10 (sans référence ni numéro), rattaché à la personne « p1 ».
const manuel: PaiementComparable = {
  id: "manuel",
  canal: "WAVE",
  montant: 2000,
  dateReception: new Date("2026-10-27T09:00:00.000Z"),
  reference: null,
  telephoneExpediteur: null,
  nomExpediteur: null,
  texteBrut: null,
  personneId: "p1",
};
// Le SMS du même versement, arrivé en retard.
const smsEnRetard = {
  canal: "WAVE" as const,
  montant: 2000,
  dateReception: new Date("2026-10-27T16:15:00.000Z"),
  reference: "TLYRDN5XXLDG5AVBH",
  telephoneExpediteur: "781112233",
  personneIds: ["p1"], // p1 a ce numéro
};

describe("chercherDoublonsProbables", () => {
  it("saisie manuelle puis SMS en retard : même canal, montant, jour et personne → doublon probable", () => {
    expect(chercherDoublonsProbables(smsEnRetard, [manuel]).map((p) => p.id)).toEqual(["manuel"]);
  });

  it("même numéro (sans personne connue) → doublon probable", () => {
    const sms1 = { ...manuel, id: "sms1", personneId: null, telephoneExpediteur: "781112233" };
    expect(chercherDoublonsProbables({ ...smsEnRetard, personneIds: [], reference: null }, [sms1])).toHaveLength(1);
  });

  it.each([
    ["autre montant", { montant: 2500 }],
    ["autre jour", { dateReception: new Date("2026-10-28T09:00:00.000Z") }],
    ["autre canal", { canal: "CASH" as const }],
    ["autre personne", { personneId: "p2" }],
    ["référence différente", { reference: "TYT7YIR0O97D9JB9O" }],
  ])("pas un doublon : %s", (_cas, modif) => {
    expect(chercherDoublonsProbables(smsEnRetard, [{ ...manuel, ...modif }])).toEqual([]);
  });
});

describe("completerDepuisSms (« C'est le même : compléter »)", () => {
  const sms = { reference: "TLYRDN5XXLDG5AVBH", telephoneExpediteur: "781112233", nomExpediteur: "rokh", texteBrut: "Vous avez recu 2.000F…" };

  it("ajoute la référence, le numéro, le nom Wave et le texte au paiement saisi à la main", () => {
    expect(completerDepuisSms(manuel, sms)).toEqual({
      donnees: { reference: "TLYRDN5XXLDG5AVBH", telephoneExpediteur: "781112233", nomExpediteur: "rokh", texteBrut: "Vous avez recu 2.000F…" },
      champs: ["reference", "telephoneExpediteur", "nomExpediteur", "texteBrut"],
    });
  });

  it("ne remplace jamais une valeur déjà présente", () => {
    const dejaRempli = { ...manuel, nomExpediteur: "Rokhaya Sow", telephoneExpediteur: "771234567" };
    const { donnees, champs } = completerDepuisSms(dejaRempli, sms);
    expect(donnees).toEqual({ reference: "TLYRDN5XXLDG5AVBH", texteBrut: "Vous avez recu 2.000F…" });
    expect(champs).toEqual(["reference", "texteBrut"]);
  });

  it("rien à compléter si le SMS n'apporte rien de nouveau", () => {
    const complet = { reference: "X", telephoneExpediteur: "781112233", nomExpediteur: "rokh", texteBrut: "…" };
    expect(completerDepuisSms(complet, sms)).toEqual({ donnees: {}, champs: [] });
  });
});
