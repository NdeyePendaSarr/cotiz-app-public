import { describe, expect, it } from "vitest";
import { estHoteLocal, verifierEnvironnementSeed } from "@/lib/seed/garde-fous";

const local = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

describe("estHoteLocal", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres@localhost:5432/postgres",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("local : %s", (url) => {
    expect(estHoteLocal(url)).toBe(true);
  });

  it.each([
    ["pooler Supabase", "postgresql://postgres.abc:mdp@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"],
    ["projet Supabase cloud", "https://abcdefgh.supabase.co"],
    ["faux sous-domaine", "http://localhost.pirate.com:54321"],
    ["piège dans l'identifiant", "postgresql://user@127.0.0.1@pirate.com:5432/db"],
    ["vide", ""],
    ["absent", undefined],
    ["pas une URL", "127.0.0.1"],
  ])("pas local : %s", (_cas, url) => {
    expect(estHoteLocal(url)).toBe(false);
  });
});

describe("verifierEnvironnementSeed", () => {
  it("autorise un environnement entièrement local", () => {
    expect(verifierEnvironnementSeed(local)).toBeNull();
  });

  it("refuse NODE_ENV=production, même avec des URL locales", () => {
    expect(verifierEnvironnementSeed({ ...local, NODE_ENV: "production" })).toMatch(/NODE_ENV/);
  });

  it("refuse une base de données distante", () => {
    expect(verifierEnvironnementSeed({ ...local, DATABASE_URL: "postgresql://x:y@db.abcdefgh.supabase.co:5432/postgres" })).toMatch(/DATABASE_URL/);
  });

  it("refuse une API Supabase distante, même si la base est locale (clé d'administration)", () => {
    expect(verifierEnvironnementSeed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co" })).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
