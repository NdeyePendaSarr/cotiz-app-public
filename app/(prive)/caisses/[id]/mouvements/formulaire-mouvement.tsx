"use client";

import { useActionState } from "react";
import type { EtatFormulaireMouvement } from "@/app/actions/comptes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLASSE_LISTE } from "@/components/cotiz/styles";
import { LIBELLES_CANAL } from "@/lib/format";

type Action = (etat: EtatFormulaireMouvement, formData: FormData) => Promise<EtatFormulaireMouvement>;
export type ValeursMouvement = { date: string; montant: string; sens: string; canal: string; note: string };

const SENS = [
  { valeur: "VERSEMENT", libelle: "Versement", detail: "il me confie de l'argent" },
  { valeur: "RETRAIT", libelle: "Retrait", detail: "je lui en rends" },
];

/** Versement ou retrait d'un compte gardé. Champs non contrôlés, repris de l'état en cas d'erreur. */
export function FormulaireMouvement({ action, valeursInitiales, libelleBouton }: { action: Action; valeursInitiales: ValeursMouvement; libelleBouton: string }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const v = etat?.valeurs ?? valeursInitiales;
  const e = etat?.erreurs ?? {};

  return (
    // key : après une erreur, les champs reprennent les valeurs renvoyées par le serveur.
    <form key={JSON.stringify(v)} action={envoyer} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Mouvement</legend>
        <div className="grid grid-cols-2 gap-2">
          {SENS.map((o) => (
            <label
              key={o.valeur}
              className="flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border border-input px-3 py-2 has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input type="radio" name="sens" value={o.valeur} defaultChecked={v.sens === o.valeur} className="sr-only" />
              <span className="font-semibold">{o.libelle}</span>
              <span className="text-xs text-muted-foreground">{o.detail}</span>
            </label>
          ))}
        </div>
        {e.sens && (
          <p role="alert" className="text-sm text-destructive">
            {e.sens}
          </p>
        )}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Champ id="montant" libelle="Montant (FCFA)" erreur={e.montant}>
          <Input id="montant" name="montant" inputMode="numeric" defaultValue={v.montant} placeholder="10 000" aria-invalid={Boolean(e.montant)} className="text-base" />
        </Champ>
        <Champ id="date" libelle="Date" erreur={e.date}>
          <Input id="date" name="date" type="date" defaultValue={v.date} aria-invalid={Boolean(e.date)} className="text-base" />
        </Champ>
      </div>
      <Champ id="canal" libelle="Par" erreur={e.canal}>
        <select id="canal" name="canal" defaultValue={v.canal} aria-invalid={Boolean(e.canal)} className={CLASSE_LISTE}>
          <option value="" disabled>
            Choisir…
          </option>
          {(Object.keys(LIBELLES_CANAL) as (keyof typeof LIBELLES_CANAL)[]).map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CANAL[c]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ id="note" libelle="Note (facultatif)" erreur={e.note}>
        <Input id="note" name="note" defaultValue={v.note} maxLength={200} placeholder="Frais d'inscription" aria-invalid={Boolean(e.note)} className="text-base" />
      </Champ>

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      <Button type="submit" size="lg" disabled={enCours} className="text-base">
        {enCours ? "Enregistrement…" : libelleBouton}
      </Button>
    </form>
  );
}

function Champ({ id, libelle, erreur, children }: { id: string; libelle: string; erreur?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{libelle}</Label>
      {children}
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      )}
    </div>
  );
}
