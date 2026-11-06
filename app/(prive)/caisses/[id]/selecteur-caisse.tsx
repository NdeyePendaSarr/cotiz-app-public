"use client";

import { ArrowLeftRight } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Sélecteur de caisse (cahier) : change de caisse sans revenir à la liste. Placé discrètement
 * dans l'en-tête (audit, lot 3) : le nom de la caisse est déjà le titre, le champ affiche donc
 * « Changer de caisse » plutôt que la caisse courante.
 */
export function SelecteurCaisse({ caisseId, caisses, compact = false }: { caisseId: string; caisses: { id: string; nom: string; statut: string }[]; compact?: boolean }) {
  const router = useRouter();
  return (
    <label
      className={
        compact
          ? "relative flex size-11 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground"
          : "relative mt-3 flex h-11 w-fit items-center gap-1.5 rounded-full bg-primary-foreground/15 pr-3 pl-3 text-sm font-semibold text-primary-foreground"
      }
    >
      <ArrowLeftRight aria-hidden className={compact ? "size-5" : "size-4"} />
      {!compact && "Changer de caisse"}
      <select
        aria-label="Changer de caisse"
        value=""
        onChange={(e) => e.target.value && router.push(`/caisses/${e.target.value}`)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="" disabled>
          Changer de caisse
        </option>
        {caisses
          .filter((c) => c.id !== caisseId)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
              {c.statut === "ARCHIVEE" ? " (archivée)" : ""}
            </option>
          ))}
      </select>
    </label>
  );
}
