import { describe, expect, it } from "vitest";
import { refusFichier } from "@/lib/import/fichier";

describe("refusFichier", () => {
  it("accepte un fichier texte ou CSV", () => {
    expect(refusFichier("liste.txt", "N°\tPrénom\tNom\n1\tAwa\tDiop")).toBeNull();
    expect(refusFichier("liste.csv", "Nom;Téléphone\nAwa Diop;771234567")).toBeNull();
  });

  it("refuse un document Word, avec la marche à suivre", () => {
    expect(refusFichier("cotiz.docx", "PK\u0003\u0004[Content_Types].xml")).toMatch(/^Ce fichier est un document Word : ouvre-le/);
    expect(refusFichier("ANCIEN.DOC", "")).toMatch(/document Word/);
  });

  it("refuse un classeur Excel", () => {
    expect(refusFichier("cotisations.xlsx", "PK...")).toMatch(/classeur Excel/);
  });

  it("refuse un contenu binaire, même avec une extension de texte", () => {
    expect(refusFichier("liste.txt", "PK\u0003\u0004")).toMatch(/n'est pas du texte/);
    expect(refusFichier("liste", "%PDF-1.7")).toMatch(/n'est pas du texte/);
    expect(refusFichier("liste.csv", "Nom\u0000\u0000")).toMatch(/n'est pas du texte/);
    expect(refusFichier("liste.csv", "Nom ��")).toMatch(/n'est pas du texte/);
  });
});
