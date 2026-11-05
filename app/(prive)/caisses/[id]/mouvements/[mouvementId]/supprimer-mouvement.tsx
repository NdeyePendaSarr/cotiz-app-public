"use client";

import { BoutonEnvoi } from "@/components/cotiz/bouton-envoi";
import { useState } from "react";
import { supprimerMouvement } from "@/app/actions/comptes";
import { Button } from "@/components/ui/button";

/** Suppression en deux temps : une erreur de doigt ne supprime rien. Tracée dans le journal d'audit. */
export function SupprimerMouvement({ mouvementId }: { mouvementId: string }) {
  const [confirmation, setConfirmation] = useState(false);

  if (!confirmation) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirmation(true)} className="text-base text-destructive">
        Supprimer ce mouvement
      </Button>
    );
  }
  return (
    <form action={supprimerMouvement} role="alertdialog" aria-label="Confirmer la suppression" className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-semibold">Supprimer ce mouvement ?</p>
      <p className="text-sm text-muted-foreground">Le solde du compte sera recalculé. La suppression reste visible dans le journal d&apos;audit.</p>
      <input type="hidden" name="mouvementId" value={mouvementId} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setConfirmation(false)} className="text-base">
          Annuler
        </Button>
        <BoutonEnvoi variant="destructive" className="text-base">
          Supprimer
        </BoutonEnvoi>
      </div>
    </form>
  );
}
