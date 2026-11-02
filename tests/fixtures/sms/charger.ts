import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Lit format-wave.txt (SMS Wave au format réel, données inventées, séparés par une ligne de tirets) et
// renvoie chaque SMS tel quel : fins de ligne Windows et espaces parasites compris.
export function chargerSmsFormatWave(): string[] {
  const chemin = fileURLToPath(new URL("./format-wave.txt", import.meta.url));
  const contenu = readFileSync(chemin, "utf8");
  return contenu
    .split(/(?:\r?\n)+[ \t]*-{3,}[ \t]*(?:\r?\n)+/)
    .filter((sms) => sms.trim() !== "");
}
