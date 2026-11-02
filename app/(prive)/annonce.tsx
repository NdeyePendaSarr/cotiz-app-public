"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

// Affiche le message de confirmation déposé par une Server Action (lib/annonce.ts), au-dessus
// de la barre d'onglets, puis l'efface. Le cookie est relu régulièrement : une action peut
// rafraîchir la page sans navigation (refresh()), aucun événement ne le signale.

const NOM = "cotiz_annonce";
const lire = () => document.cookie.split("; ").find((c) => c.startsWith(`${NOM}=`))?.slice(NOM.length + 1) ?? "";
function sAbonner(rappel: () => void) {
  const minuteur = setInterval(rappel, 300);
  return () => clearInterval(minuteur);
}

const DUREE = 3500; // ms

export function Annonce() {
  const brut = useSyncExternalStore(sAbonner, lire, () => "");
  const [annonce, setAnnonce] = useState<{ cle: string; texte: string } | null>(null);

  useEffect(() => {
    if (!brut) return;
    document.cookie = `${NOM}=; Max-Age=0; path=/`; // lu une seule fois
    let cle = "";
    let texte = "";
    try {
      const decode = decodeURIComponent(brut);
      const separateur = decode.indexOf("|");
      if (separateur < 0) return;
      cle = decode.slice(0, separateur);
      texte = decode.slice(separateur + 1);
    } catch {
      return;
    }
    // Minuteurs volontairement non annulés : effacer le cookie relance cet effet, le message doit rester affiché.
    setTimeout(() => setAnnonce({ cle, texte }), 0);
    setTimeout(() => setAnnonce((a) => (a?.cle === cle ? null : a)), DUREE);
  }, [brut]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 lg:bottom-8 lg:pl-64">
      {annonce && (
        <p
          role="status"
          className="flex max-w-md animate-in items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-lg fade-in slide-in-from-bottom-2"
        >
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-paye brightness-150" />
          {annonce.texte}
        </p>
      )}
    </div>
  );
}
