"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { CLE_THEME, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Préférence d'apparence lue dans le stockage du navigateur (voir lib/theme.ts).
const EVENEMENT = "cotiz:theme";

function lire(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME);
    return t === "sombre" || t === "auto" ? t : "clair";
  } catch {
    return "clair";
  }
}

function sAbonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}

function choisir(theme: Theme) {
  try {
    localStorage.setItem(CLE_THEME, theme);
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour cette page seulement
  }
  const sombre = theme === "sombre" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", sombre);
  document.documentElement.style.colorScheme = sombre ? "dark" : "light";
  window.dispatchEvent(new Event(EVENEMENT));
}

function useTheme() {
  return useSyncExternalStore(sAbonner, lire, () => "clair" as Theme);
}

/** Choix de l'apparence en trois boutons (page « Mon profil »). */
export function ChoixTheme() {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Apparence" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {(Object.keys(THEMES) as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => choisir(t)}
          className={cn(
            "h-11 rounded-lg text-sm font-semibold transition-colors",
            theme === t ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {THEMES[t]}
        </button>
      ))}
    </div>
  );
}

/** Bascule rapide clair / sombre (barre latérale, sur ordinateur). */
export function BasculeTheme({ className }: { className?: string }) {
  const theme = useTheme();
  // En « auto », la bascule part de ce qui est affiché.
  const sombre = theme === "sombre" || (theme === "auto" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  return (
    <button
      type="button"
      onClick={() => choisir(sombre ? "clair" : "sombre")}
      aria-label={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
      title={sombre ? "Mode clair" : "Mode sombre"}
      className={className}
    >
      {sombre ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
