"use client";

import { useActionState } from "react";
import type { EtatFormulaireDepense } from "@/app/actions/depenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIBELLES_CATEGORIE } from "@/lib/depenses";
import { LIBELLES_CANAL } from "@/lib/format";
import { CLASSE_LISTE } from "@/components/cotiz/styles";

type Action = (etat: EtatFormulaireDepense, formData: FormData) => Promise<EtatFormulaireDepense>;
export type ValeursDepense = { date: string; montant: string; motif: string; beneficiaire: string; canal: string; categorie: string };

/** Saisie d'une sortie de caisse (phase 11). Champs non contrôlés, repris de l'état en cas d'erreur. */
export function FormulaireDepense({ action, valeursInitiales, libelleBouton }: { action: Action; valeursInitiales: ValeursDepense; libelleBouton: string }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const v = etat?.valeurs ?? valeursInitiales;
  const e = etat?.erreurs ?? {};

  return (
    // key : après une erreur, les champs reprennent les valeurs renvoyées par le serveur.
    <form key={JSON.stringify(v)} action={envoyer} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Champ id="montant" libelle="Montant (FCFA)" erreur={e.montant}>
          <Input id="montant" name="montant" inputMode="numeric" defaultValue={v.montant} placeholder="20 000" aria-invalid={Boolean(e.montant)} className="text-base" />
        </Champ>
        <Champ id="date" libelle="Date" erreur={e.date}>
          <Input id="date" name="date" type="date" defaultValue={v.date} aria-invalid={Boolean(e.date)} className="text-base" />
        </Champ>
      </div>
      <Champ id="motif" libelle="Motif" erreur={e.motif}>
        <Input id="motif" name="motif" defaultValue={v.motif} maxLength={200} placeholder="Complément des dépenses de nourriture" aria-invalid={Boolean(e.motif)} className="text-base" />
      </Champ>
      <Champ id="categorie" libelle="Catégorie" erreur={e.categorie}>
        <select id="categorie" name="categorie" defaultValue={v.categorie} aria-invalid={Boolean(e.categorie)} className={CLASSE_LISTE}>
          <option value="" disabled>
            Choisir…
          </option>
          {(Object.keys(LIBELLES_CATEGORIE) as (keyof typeof LIBELLES_CATEGORIE)[]).map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CATEGORIE[c]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ id="canal" libelle="Sortie par" erreur={e.canal}>
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
      <Champ id="beneficiaire" libelle="Remis à (facultatif)" erreur={e.beneficiaire}>
        <Input id="beneficiaire" name="beneficiaire" defaultValue={v.beneficiaire} maxLength={150} placeholder="Awa Diop" aria-invalid={Boolean(e.beneficiaire)} className="text-base" />
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
