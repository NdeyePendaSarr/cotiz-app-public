import { afterEach, describe, expect, it, vi } from "vitest";
import { decrireErreur, signalerErreur } from "@/lib/erreurs";

describe("trace d'une erreur serveur", () => {
  afterEach(() => vi.restoreAllMocks());

  const erreurPrisma = () => Object.assign(new Error("Unique constraint failed: 770000000, Awa Diallo"), { name: "PrismaClientKnownRequestError", code: "P2002", digest: "123" });

  it("garde le type, le code, la référence et les lignes de code", () => {
    expect(decrireErreur(erreurPrisma())).toMatchObject({ type: "PrismaClientKnownRequestError", code: "P2002", digest: "123", pile: expect.any(Array) });
    expect(decrireErreur("texte")).toEqual({ type: "string" });
  });

  it("n'écrit jamais le message, qui peut citer des données personnelles", () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    signalerErreur("cycles.cloturer", erreurPrisma(), { chemin: "/caisses" });
    const ecrit = String(journal.mock.calls[0][0]);
    expect(JSON.parse(ecrit)).toMatchObject({ erreurCotiz: "cycles.cloturer", chemin: "/caisses", code: "P2002" });
    expect(ecrit).not.toContain("Awa");
    expect(ecrit).not.toContain("770000000");
  });
});
