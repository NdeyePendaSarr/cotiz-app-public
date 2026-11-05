import { LIBELLES_STATUT_ECHEANCE, type StatutEcheance } from "@/lib/echeances/statut";
import { cn } from "@/lib/utils";

/**
 * Teintes des pastilles (lot 2) : une seule définition pour toute l'application.
 * Les statuts d'une échéance (payé, partiel, en attente) sont distincts de l'avertissement.
 */
const TONS = {
  paye: "bg-paye/12 text-paye",
  partiel: "bg-partiel/12 text-partiel",
  attente: "bg-attente/12 text-attente",
  retard: "bg-retard/12 text-retard",
  avertissement: "bg-avertissement/15 text-avertissement",
  info: "bg-secondary text-secondary-foreground",
  neutre: "bg-muted text-muted-foreground",
} as const;

export type Ton = keyof typeof TONS;

const TON_STATUT: Record<StatutEcheance, Ton> = { PAYE: "paye", PARTIEL: "partiel", EN_ATTENTE: "attente", A_VENIR: "attente" };

/** Petite étiquette arrondie (statut, type de caisse, état d'une ligne d'import…). */
export function Pastille({ ton, children, className }: { ton: Ton; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", TONS[ton], className)}>
      {children}
    </span>
  );
}

/** Statut d'une échéance : « Payé », « Partiel » ou « En attente ». */
export function PastilleStatut({ statut, className }: { statut: StatutEcheance; className?: string }) {
  return (
    <Pastille ton={TON_STATUT[statut]} className={className}>
      {LIBELLES_STATUT_ECHEANCE[statut]}
    </Pastille>
  );
}
