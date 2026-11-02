import { describe, expect, it } from "vitest";
import { formaterFCFA } from "@/lib/format";
import { decrireLigne } from "@/lib/historique";

const P = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";
const paiement = (action: string, details: unknown) => ({ entite: "Paiement", entiteId: P, action, details });

describe("decrireLigne", () => {
  it("création selon la source", () => {
    expect(decrireLigne(paiement("CREATION", { source: "SMS_WAVE", montant: 10000 }))).toBe("Enregistré depuis un SMS Wave");
    expect(decrireLigne(paiement("CREATION", { source: "SAISIE_MANUELLE" }))).toBe("Enregistré par saisie manuelle");
    expect(decrireLigne(paiement("CREATION", { source: "REPRISE_IMPORT", canal: "WAVE" }))).toBe("Repris d'une liste importée (déjà versé)");
  });

  it("complétion depuis un SMS, avec les champs ajoutés", () => {
    expect(decrireLigne(paiement("COMPLETION", { depuis: "SMS", champs: ["reference", "nomExpediteur"] }))).toBe(
      "Complété depuis un SMS (référence, nom Wave)",
    );
  });

  it("rapprochement, avec ou sans excédent", () => {
    expect(decrireLigne(paiement("MODIFICATION", { rapprochement: true, excedent: 0 }))).toBe("Rapproché");
    expect(decrireLigne(paiement("MODIFICATION", { rapprochement: true, excedent: 5000 }))).toBe(`Rapproché, excédent de ${formaterFCFA(5000)}`);
  });

  it("changements de statut, annulation et remboursement", () => {
    expect(decrireLigne(paiement("MODIFICATION", { statut: "IGNORE" }))).toBe("Ignoré (sans rapport avec les tontines)");
    expect(decrireLigne(paiement("MODIFICATION", { statut: "A_RAPPROCHER" }))).toBe("Remis à rapprocher");
    expect(decrireLigne(paiement("MODIFICATION", { annulationRapprochement: true }))).toBe("Rapprochement annulé : de nouveau à rapprocher");
    expect(decrireLigne(paiement("MODIFICATION", { rembourse: 5000 }))).toBe(`Excédent remboursé : ${formaterFCFA(5000)}`);
  });

  it("allocations : nomme l'échéance quand elle est connue", () => {
    const echeances = new Map([[E, "Tontine Liberté, cycle 3"]]);
    const ligne = { entite: "Allocation", entiteId: `${P}:${E}`, action: "CREATION", details: { montant: 10000 } };
    expect(decrireLigne(ligne, echeances)).toBe(`Réparti sur Tontine Liberté, cycle 3 : ${formaterFCFA(10000)}`);
    expect(decrireLigne({ ...ligne, action: "SUPPRESSION" })).toBe(`Répartition annulée sur une échéance : ${formaterFCFA(10000)}`);
  });

  it("ligne inconnue ou détails illisibles : ne plante pas", () => {
    expect(decrireLigne(paiement("MODIFICATION", null))).toBe("Paiement : modification");
    expect(decrireLigne({ entite: "Autre", entiteId: "x", action: "TRUC", details: "texte" })).toBe("Autre : truc");
  });
});
