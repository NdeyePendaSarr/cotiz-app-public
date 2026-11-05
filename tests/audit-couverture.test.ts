import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou du cahier : « chaque modification de paiement ou d'allocation apparaît dans le
// journal d'audit ». Analyse statique du code : toute fonction qui crée, modifie ou supprime
// un Paiement, une Allocation, un SmsNonLu, une Depense (phase 11) ou un Don (bonne volonté) doit le faire dans une
// transaction (tx.…) et appeler journaliser(). Un oubli dans une future Server Action fait échouer ce test.

const RACINE = join(__dirname, "..");
const DOSSIERS = ["app", "lib"];
const MUTATION = /\b(tx|prisma)\.(paiement|allocation|smsNonLu|depense|don|mouvementCompte)\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|delete|deleteMany|upsert)\s*\(/g;
// Nom de l'entité dans journaliser(tx, { entite: "…" }).
const ENTITES: Record<string, string> = { paiement: "Paiement", allocation: "Allocation", smsNonLu: "SmsNonLu", depense: "Depense", don: "Don", mouvementCompte: "MouvementCompte" };

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : fichiersTs(chemin);
    return /\.tsx?$/.test(e.name) ? [chemin] : [];
  });
}

/**
 * Découpe un fichier en fonctions de premier niveau : `function nom` et aussi les fonctions fléchées
 * `const nom = async (…) =>` (audit, lot 2 : elles échappaient au contrôle).
 */
function fonctions(source: string) {
  const debuts = [...source.matchAll(/^(?:export )?(?:(?:async )?function (\w+)|const (\w+) = (?:async )?(?:\([^)]*\)|\w+) =>)/gm)];
  return debuts.map((m, i) => ({ nom: m[1] ?? m[2], corps: source.slice(m.index, debuts[i + 1]?.index ?? source.length) }));
}

const mutations = DOSSIERS.flatMap((d) => fichiersTs(join(RACINE, d)))
  .filter((f) => !f.endsWith(join("lib", "seed", "garde-fous.ts")))
  .flatMap((fichier) => {
    const relatif = fichier.slice(RACINE.length + 1).replaceAll("\\", "/");
    return fonctions(readFileSync(fichier, "utf8"))
      .filter((f) => f.corps.match(MUTATION))
      .map((f) => ({ ...f, fichier: relatif, appels: [...f.corps.matchAll(MUTATION)].map((m) => m[0]) }));
  });

describe("couverture du journal d'audit", () => {
  it("trouve bien les mutations à contrôler (le test ne passe pas à vide)", () => {
    const fichiers = new Set(mutations.map((m) => m.fichier));
    expect(fichiers).toContain("app/actions/capture.ts");
    expect(fichiers).toContain("app/actions/rapprochement.ts");
    expect(fichiers).toContain("app/actions/remboursement.ts");
    expect(fichiers).toContain("app/actions/depenses.ts");
    expect(fichiers).toContain("app/actions/dons.ts");
    expect(fichiers).toContain("app/actions/comptes.ts");
  });

  it.each(mutations.map((m) => [`${m.fichier} › ${m.nom}`, m] as const))("%s journalise dans une transaction", (_nom, m) => {
    expect(m.appels.filter((a) => a.startsWith("prisma.")), "mutation hors transaction").toEqual([]);
    // Dans une transaction : soit la fonction l'ouvre, soit elle reçoit le client de transaction (tx).
    const dansUneTransaction =
      m.corps.includes("$transaction") || /^(?:export )?(?:async )?function \w+\(\s*tx: /.test(m.corps) || /^(?:export )?const \w+ = (?:async )?\(\s*tx: /.test(m.corps);
    expect(dansUneTransaction, "transaction manquante").toBe(true);
    expect(m.corps, "appel à journaliser() manquant").toContain("journaliser(");
    // Un journal par entité modifiée : celui d'un paiement ne couvre pas la suppression d'une allocation.
    for (const entite of new Set(m.appels.map((a) => a.split(".")[1]))) {
      expect(m.corps, `journal de ${ENTITES[entite]} manquant`).toMatch(new RegExp(`entite: "${ENTITES[entite]}"`));
    }
  });

  it("aucune écriture SQL brute ne contourne ce contrôle", () => {
    const brutes = DOSSIERS.flatMap((d) => fichiersTs(join(RACINE, d))).filter((f) => /\$executeRaw(Unsafe)?\b/.test(readFileSync(f, "utf8")) && /\b(paiements|allocations|sms_non_lus|depenses|dons|mouvements_compte)\b/.test(readFileSync(f, "utf8")));
    expect(brutes.map((f) => f.slice(RACINE.length + 1))).toEqual([]);
  });
});
