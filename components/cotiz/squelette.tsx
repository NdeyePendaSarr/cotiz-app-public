import { cn } from "@/lib/utils";

// Blocs gris animés pendant le chargement (audit, lot 3) : la page garde sa forme, ce qui
// paraît plus rapide qu'un texte « Chargement… ». Masqués aux lecteurs d'écran.

function Barre({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

/** Une liste de lignes (nom + détail) dans un bloc blanc, comme les listes de l'app. */
export function SqueletteListe({ lignes = 5, titre = true }: { lignes?: number; titre?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {titre && <Barre className="h-3 w-28" />}
      <div className="divide-y divide-border rounded-2xl bg-card px-4 ring-1 ring-border">
        {Array.from({ length: lignes }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center justify-between gap-3 py-3">
            <span className="flex flex-1 flex-col gap-2">
              <Barre className={cn("h-4", i % 2 ? "w-2/3" : "w-1/2")} />
              <Barre className="h-3 w-1/3" />
            </span>
            <Barre className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un formulaire : quelques champs et un bouton. */
export function SqueletteFormulaire({ champs = 4 }: { champs?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {Array.from({ length: champs }, (_, i) => (
        <span key={i} className="flex flex-col gap-2">
          <Barre className="h-3 w-24" />
          <Barre className="h-11 w-full rounded-xl" />
        </span>
      ))}
      <Barre className="h-11 w-full rounded-xl" />
    </div>
  );
}
