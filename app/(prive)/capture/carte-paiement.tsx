import Link from "next/link";
import type { ResumePaiement } from "@/app/actions/capture";
import { formaterDateHeure, formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";
import { cn } from "@/lib/utils";

/**
 * Résumé lisible d'un paiement (utilisable côté serveur comme côté navigateur).
 * `lienHistorique` : ajoute un lien vers /paiements/[id] (journal d'audit du paiement).
 */
export function CartePaiement({
  paiement: p,
  lienHistorique = false,
  className,
  children,
}: {
  paiement: ResumePaiement;
  lienHistorique?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const qui = p.personne ?? p.nomExpediteur;
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl bg-card p-3 ring-1 ring-border", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">{formaterFCFA(p.montant)}</span>
        <span className="text-sm text-muted-foreground">{LIBELLES_CANAL[p.canal]}</span>
      </span>
      <span>
        {qui ?? <span className="text-muted-foreground">Expéditeur inconnu</span>}
        {p.telephoneExpediteur && <span className="text-muted-foreground"> · {formaterTelephone(p.telephoneExpediteur)}</span>}
      </span>
      <span className="text-sm text-muted-foreground">
        {formaterDateHeure(new Date(p.dateReception))}
        {p.reference && ` · réf. ${p.reference}`}
      </span>
      {children}
      {lienHistorique && (
        <Link href={`/paiements/${p.id}`} className="flex h-11 items-center text-sm underline underline-offset-4">
          Voir l&apos;historique
        </Link>
      )}
    </div>
  );
}
