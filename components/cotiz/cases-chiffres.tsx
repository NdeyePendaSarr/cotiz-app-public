import { cn } from "@/lib/utils";

export type CaseChiffre = {
  libelle: string;
  valeur: string;
  /** Ligne d'explication sous le chiffre (« dont … de bonnes volontés »). */
  detail?: string;
  /** Couleur du chiffre (ex. text-paye, text-retard). */
  couleur?: string;
};

/** Rangée de chiffres côte à côte (Cotisations · Bonnes volontés · Encaissé…), une seule mise en forme. */
export function CasesChiffres({ cases, className }: { cases: CaseChiffre[]; className?: string }) {
  return (
    <dl className={cn("grid auto-cols-fr grid-flow-col gap-2 py-3 text-center", className)}>
      {cases.map((c) => (
        <div key={c.libelle}>
          <dt className="text-xs text-muted-foreground">{c.libelle}</dt>
          <dd className={cn("font-heading font-bold", c.couleur)}>{c.valeur}</dd>
          {c.detail && <dd className="text-xs text-muted-foreground">{c.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
