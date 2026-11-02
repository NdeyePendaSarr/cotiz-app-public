"use client";

import { useActionState, useState } from "react";
import type { EtatSaisieManuelle } from "@/app/actions/capture";
import { ChoixPersonne, type PersonneChoisissable } from "@/components/cotiz/choix-personne";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIBELLES_CANAL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CartePaiement } from "../carte-paiement";

type Action = (etat: EtatSaisieManuelle, formData: FormData) => Promise<EtatSaisieManuelle>;
type Defauts = { date: string; heure: string };

const CANAUX = ["WAVE", "ORANGE_MONEY", "CASH"] as const;
/** Saisie manuelle (Wave sans SMS, Orange Money, cash). La clé remet tout à zéro après une saisie. */
export function SaisieManuelle(props: { action: Action; personnes: PersonneChoisissable[]; defauts: Defauts; depuisSms: boolean }) {
  const [cle, setCle] = useState(0);
  return <Formulaire key={cle} {...props} recommencer={() => setCle((c) => c + 1)} />;
}

function Formulaire({
  action,
  personnes,
  defauts,
  depuisSms,
  recommencer,
}: {
  action: Action;
  personnes: PersonneChoisissable[];
  defauts: Defauts;
  depuisSms: boolean;
  recommencer: () => void;
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const valeurs = etat?.valeurs ?? {};
  const erreurs = etat?.erreurs ?? {};
  const [canal, setCanal] = useState(valeurs.canal || (depuisSms ? "WAVE" : "CASH"));

  if (etat?.enregistre) {
    return (
      <section role="status" className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold">Paiement enregistré</h2>
        <CartePaiement paiement={etat.enregistre} />
        <Button type="button" onClick={recommencer} autoFocus className="h-11 text-base">
          Nouvelle saisie
        </Button>
      </section>
    );
  }

  return (
    <form action={envoyer} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Canal</legend>
        <div className="grid grid-cols-3 gap-2">
          {CANAUX.map((c) => (
            <label
              key={c}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-lg border text-center text-sm",
                canal === c && "border-primary bg-primary text-primary-foreground",
              )}
            >
              <input type="radio" name="canal" value={c} checked={canal === c} onChange={() => setCanal(c)} aria-label={LIBELLES_CANAL[c]} className="sr-only" />
              {LIBELLES_CANAL[c]}
            </label>
          ))}
        </div>
        <Erreur message={erreurs.canal} />
      </fieldset>

      <Champ id="montant" label="Montant (FCFA)" erreur={erreurs.montant}>
        <Input id="montant" name="montant" inputMode="numeric" placeholder="2 000" defaultValue={valeurs.montant} aria-invalid={Boolean(erreurs.montant)} className="h-11 text-base" />
      </Champ>

      <div className="grid grid-cols-2 gap-3">
        <Champ id="date" label="Date" erreur={erreurs.date}>
          <Input id="date" name="date" type="date" defaultValue={valeurs.date || defauts.date} aria-invalid={Boolean(erreurs.date)} className="h-11 text-base" />
        </Champ>
        <Champ id="heure" label="Heure" erreur={erreurs.heure}>
          <Input id="heure" name="heure" type="time" defaultValue={valeurs.heure || defauts.heure} aria-invalid={Boolean(erreurs.heure)} className="h-11 text-base" />
        </Champ>
      </div>

      <Champ id="personneId" label="Personne (si connue)" erreur={erreurs.personneId}>
        <ChoixPersonne
          personnes={personnes}
          name="personneId"
          valeurInitiale={valeurs.personneId || null}
          libelle="Rechercher la personne"
          aucunChoix="Laisse vide si tu ne sais pas : le paiement sera à rapprocher ce soir."
        />
      </Champ>

      {canal !== "CASH" && (
        <Champ id="reference" label="Référence (facultative)" erreur={erreurs.reference}>
          <Input id="reference" name="reference" autoCapitalize="characters" defaultValue={valeurs.reference} className="h-11 text-base" />
        </Champ>
      )}

      <Champ id="note" label="Note (facultative)" erreur={erreurs.note}>
        <Input id="note" name="note" defaultValue={valeurs.note} className="h-11 text-base" />
      </Champ>

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat?.dejaEnregistre && (
        <section role="alert" className="flex flex-col gap-2">
          <p className="font-semibold">Déjà enregistré : cette référence existe déjà.</p>
          <CartePaiement paiement={etat.dejaEnregistre} />
        </section>
      )}

      {etat?.doublons ? (
        <section role="alert" className="flex flex-col gap-3 rounded-xl border border-avertissement/40 bg-avertissement/10 p-4">
          <h2 className="font-semibold">Peut-être déjà enregistré</h2>
          {etat.doublons.map((p) => (
            <CartePaiement key={p.id} paiement={p} />
          ))}
          <Button type="submit" name="decision" value="nouveau" variant="outline" disabled={enCours} className="h-11 text-base">
            Enregistrer quand même
          </Button>
          <Button type="button" variant="ghost" onClick={recommencer} className="h-11 text-base">
            Annuler
          </Button>
        </section>
      ) : (
        <Button type="submit" disabled={enCours} className="h-11 text-base">
          {enCours ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
      )}
    </form>
  );
}

function Champ({ id, label, erreur, children }: { id: string; label: string; erreur?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <Erreur message={erreur} />
    </div>
  );
}

function Erreur({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
