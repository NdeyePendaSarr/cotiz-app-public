"use client";

import { useActionState } from "react";
import { attribuerOrdre } from "@/app/actions/membres";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Membre actif sans ordre (réactivé) : la trésorière lui attribue un ordre libre à la main. */
export function FormulaireOrdre({ membreId, suggestion, nom }: { membreId: string; suggestion: number; nom: string }) {
  const [etat, envoyer, enCours] = useActionState(attribuerOrdre, undefined);

  return (
    <form action={envoyer} className="flex flex-col gap-1">
      <input type="hidden" name="membreId" value={membreId} />
      <div className="flex gap-2">
        <Input
          name="ordre"
          inputMode="numeric"
          defaultValue={String(suggestion)}
          aria-label={`Ordre de passage de ${nom}`}
          aria-invalid={Boolean(etat?.erreur)}
          className="h-11 w-16 text-center text-base"
        />
        <Button type="submit" variant="outline" disabled={enCours} className="h-11">
          Attribuer
        </Button>
      </div>
      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
