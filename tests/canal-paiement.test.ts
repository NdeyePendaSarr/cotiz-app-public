import { describe, expect, it } from "vitest";
import { decrireLigne } from "@/lib/historique";
import { refusCorrectionCanal } from "@/lib/paiements/canal";

describe("refusCorrectionCanal", () => {
  const declare = { source: "SAISIE_MANUELLE" as const, reference: null, datation: null };

  it("canal déclaré (saisie manuelle, versé repris non daté ou daté à la main) : corrigeable", () => {
    expect(refusCorrectionCanal(declare)).toBeNull();
    expect(refusCorrectionCanal({ ...declare, datation: "NON_DATEE" })).toBeNull();
    expect(refusCorrectionCanal({ ...declare, datation: "A_LA_MAIN" })).toBeNull();
  });

  it("canal prouvé (SMS collé, datation par SMS, référence) : refusé", () => {
    expect(refusCorrectionCanal({ ...declare, source: "SMS_WAVE" })).toContain("SMS Wave");
    expect(refusCorrectionCanal({ ...declare, datation: "PAR_SMS" })).toContain("daté");
    expect(refusCorrectionCanal({ ...declare, reference: "PP260415.0932.C48217" })).toContain("référence");
  });

  it("historique du paiement : la correction est lisible", () => {
    expect(decrireLigne({ entite: "Paiement", entiteId: "p", action: "MODIFICATION", details: { canal: "CASH", ancienCanal: "WAVE" } })).toBe("Canal corrigé : Wave → Cash");
  });
});
