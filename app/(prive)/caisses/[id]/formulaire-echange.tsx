"use client";

import { useActionState } from "react";
import { echangerOrdres } from "@/app/actions/membres";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CLASSE_LISTE } from "@/components/cotiz/styles";

/** Échange l'ordre de passage de deux membres d'une tontine, en une seule opération. */
export function FormulaireEchange({
  caisseId,
  membres,
}: {
  caisseId: string;
  membres: { id: string; libelle: string }[];
}) {
  const [etat, envoyer, enCours] = useActionState(echangerOrdres, undefined);

  return (
    <form action={envoyer} className="flex flex-col gap-3 rounded-2xl bg-card p-4  ring-1 ring-border">
      <h3 className="font-medium">Échanger deux ordres de passage</h3>
      <input type="hidden" name="caisseId" value={caisseId} />
      {(["membreA", "membreB"] as const).map((champ, i) => (
        <div key={champ} className="flex flex-col gap-2">
          <Label htmlFor={champ}>{i === 0 ? "Membre" : "Avec"}</Label>
          <select id={champ} name={champ} defaultValue={membres[i]?.id} className={CLASSE_LISTE}>
            {membres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.libelle}
              </option>
            ))}
          </select>
        </div>
      ))}
      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat?.succes && (
        <p role="status" className="text-sm text-muted-foreground">
          {etat.succes}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={enCours} className="h-11 text-base">
        {enCours ? "Échange…" : "Échanger"}
      </Button>
    </form>
  );
}
