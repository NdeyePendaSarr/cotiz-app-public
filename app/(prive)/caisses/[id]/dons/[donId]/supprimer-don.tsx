"use client";

import { useState } from "react";
import { supprimerDon } from "@/app/actions/dons";
import { Button } from "@/components/ui/button";

/** Suppression en deux temps : une erreur de doigt ne supprime rien. Tracée dans le journal d'audit. */
export function SupprimerDon({ donId }: { donId: string }) {
  const [confirmation, setConfirmation] = useState(false);

  if (!confirmation) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirmation(true)} className="text-base text-destructive">
        Supprimer cette bonne volonté
      </Button>
    );
  }
  return (
    <form action={supprimerDon} role="alertdialog" aria-label="Confirmer la suppression" className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-semibold">Supprimer cette bonne volonté ?</p>
      <p className="text-sm text-muted-foreground">Le restant de la caisse sera recalculé. La suppression reste visible dans le journal d&apos;audit.</p>
      <input type="hidden" name="donId" value={donId} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setConfirmation(false)} className="text-base">
          Annuler
        </Button>
        <Button type="submit" variant="destructive" className="text-base">
          Supprimer
        </Button>
      </div>
    </form>
  );
}
