"use client";

import { useActionState } from "react";
import type { EtatOuvertureCycle } from "@/app/actions/cycles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (etat: EtatOuvertureCycle, formData: FormData) => Promise<EtatOuvertureCycle>;

/**
 * Premier cycle d'une tontine : numéro (1 par défaut) et date d'échéance (calculée) modifiables,
 * pour reprendre une tontine qui tourne déjà (ex. 8e tour).
 */
export function FormulaireOuvertureCycle({
  action,
  dateCalculee,
  nbMembres,
}: {
  action: Action;
  dateCalculee: string;
  nbMembres: number;
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const valeurs = etat?.valeurs ?? { numero: "1", dateEcheance: dateCalculee };
  const erreurs = etat?.erreurs ?? {};

  return (
    <form action={envoyer} className="flex flex-col gap-3 rounded-2xl bg-card p-4  ring-1 ring-border" noValidate>
      <h3 className="font-medium">Ouvrir le premier cycle</h3>
      <p className="text-sm text-muted-foreground">
        Si la tontine tourne déjà, indique le numéro du tour en cours. Une échéance sera créée pour chacun des {nbMembres} membre(s) actif(s).
      </p>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="numero">N° du cycle</Label>
          <Input
            id="numero"
            name="numero"
            inputMode="numeric"
            defaultValue={valeurs.numero}
            aria-invalid={Boolean(erreurs.numero)}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateEcheance">Date d&apos;échéance</Label>
          <Input
            id="dateEcheance"
            name="dateEcheance"
            type="date"
            defaultValue={valeurs.dateEcheance}
            aria-invalid={Boolean(erreurs.dateEcheance)}
            className="h-11 text-base"
          />
        </div>
      </div>
      {[erreurs.numero, erreurs.dateEcheance, etat?.erreur].filter(Boolean).map((m) => (
        <p key={m} role="alert" className="text-sm text-destructive">
          {m}
        </p>
      ))}
      <Button type="submit" disabled={enCours} className="h-11 text-base">
        {enCours ? "Ouverture…" : "Ouvrir le cycle"}
      </Button>
    </form>
  );
}
