import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

// Test de fumée de la phase 0 : vérifie que Vitest tourne et que l'alias @/ est résolu.
// Les vrais tests (parser SMS, matching) arrivent en phases 3 et 7.
describe("configuration", () => {
  it("résout l'alias @/ et fusionne les classes Tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
