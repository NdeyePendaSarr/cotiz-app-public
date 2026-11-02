"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// « Relancé aujourd'hui » (relance en série) : mémorisé sur ce téléphone seulement, par caisse et
// par jour (heure de Dakar = UTC). Une aide pour ne pas relancer deux fois dans la journée, pas
// un historique officiel : stockage du navigateur, qui peut être vide (navigation privée…).

const cle = (caisseId: string) => `cotiz:relances:${caisseId}:${new Date().toISOString().slice(0, 10)}`;

function lire(cleStockage: string): string {
  try {
    return localStorage.getItem(cleStockage) ?? "[]";
  } catch {
    return "[]";
  }
}

// Abonnés de cet onglet (l'événement « storage » ne prévient que les autres onglets).
const abonnes = new Set<() => void>();
function sAbonner(rappel: () => void) {
  abonnes.add(rappel);
  window.addEventListener("storage", rappel);
  return () => {
    abonnes.delete(rappel);
    window.removeEventListener("storage", rappel);
  };
}

export function useRelancesDuJour(caisseId: string) {
  const cleStockage = cle(caisseId);
  const brut = useSyncExternalStore(sAbonner, () => lire(cleStockage), () => "[]");
  const relances = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(brut));
    } catch {
      return new Set<string>();
    }
  }, [brut]);

  const marquer = useCallback(
    (membreId: string) => {
      try {
        const deja = new Set<string>(JSON.parse(lire(cleStockage)));
        deja.add(membreId);
        localStorage.setItem(cleStockage, JSON.stringify([...deja]));
      } catch {
        // Stockage indisponible : la relance part quand même, elle n'est simplement pas retenue.
      }
      abonnes.forEach((rappel) => rappel());
    },
    [cleStockage],
  );

  return { relances, marquer };
}
