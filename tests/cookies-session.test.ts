import { afterEach, describe, expect, it, vi } from "vitest";
import { DUREE_COOKIE_SESSION, optionsCookieSession } from "@/lib/supabase/config";

describe("optionsCookieSession", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cookie illisible par JavaScript, 30 jours au lieu des 400 imposés par @supabase/ssr", () => {
    expect(optionsCookieSession({ path: "/", httpOnly: false, maxAge: 400 * 86_400 })).toMatchObject({ path: "/", httpOnly: true, sameSite: "lax", maxAge: DUREE_COOKIE_SESSION });
    expect(DUREE_COOKIE_SESSION).toBe(30 * 86_400);
  });

  it("une suppression de cookie (maxAge 0) reste une suppression", () => {
    expect(optionsCookieSession({ maxAge: 0 }).maxAge).toBe(0);
  });

  it("HTTPS exigé en production seulement (téléphone sur le Wi-Fi en développement)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(optionsCookieSession({}).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(optionsCookieSession({}).secure).toBe(false);
  });
});
