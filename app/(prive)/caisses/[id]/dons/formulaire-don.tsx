"use client";

import { useActionState } from "react";
import type { EtatFormulaireDon } from "@/app/actions/dons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIBELLES_CANAL } from "@/lib/format";
import { CLASSE_LISTE } from "@/components/cotiz/styles";

type Action = (etat: EtatFormulaireDon, formData: FormData) => Promise<EtatFormulaireDon>;
export type ValeursDon = { date: string; montant: string; donateur: string; remisPar: string; canal: string; note: string };

/** Saisie d'une bonne volonté (don à une collecte). Champs non contrôlés, repris de l'état en cas d'erreur. */
export function FormulaireDon({ action, valeursInitiales, libelleBouton }: { action: Action; valeursInitiales: ValeursDon; libelleBouton: string }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const v = etat?.valeurs ?? valeursInitiales;
  const e = etat?.erreurs ?? {};

  return (
    // key : après une erreur, les champs reprennent les valeurs renvoyées par le serveur.
    <form key={JSON.stringify(v)} action={envoyer} className="flex flex-col gap-4" noValidate>
      <Champ id="donateur" libelle="De la part de" erreur={e.donateur}>
        <Input id="donateur" name="donateur" defaultValue={v.donateur} maxLength={150} placeholder="ABK, Ibou…" aria-invalid={Boolean(e.donateur)} className="text-base" />
      </Champ>
      <div className="grid grid-cols-2 gap-3">
        <Champ id="montant" libelle="Montant (FCFA)" erreur={e.montant}>
          <Input id="montant" name="montant" inputMode="numeric" defaultValue={v.montant} placeholder="30 000" aria-invalid={Boolean(e.montant)} className="text-base" />
        </Champ>
        <Champ id="date" libelle="Date" erreur={e.date}>
          <Input id="date" name="date" type="date" defaultValue={v.date} aria-invalid={Boolean(e.date)} className="text-base" />
        </Champ>
      </div>
      <Champ id="remisPar" libelle="Remis à (facultatif)" erreur={e.remisPar}>
        <Input id="remisPar" name="remisPar" defaultValue={v.remisPar} maxLength={150} placeholder="Vide si le don t'a été remis directement" aria-invalid={Boolean(e.remisPar)} className="text-base" />
      </Champ>
      <Champ id="canal" libelle="Canal" erreur={e.canal}>
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
        <Input id="note" name="note" defaultValue={v.note} maxLength={200} placeholder="Pour le séminaire" aria-invalid={Boolean(e.note)} className="text-base" />
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
