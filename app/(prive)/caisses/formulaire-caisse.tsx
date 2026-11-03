"use client";

import { useActionState, useState } from "react";
import type { EtatFormulaireCaisse } from "@/app/actions/caisses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JOURS_SEMAINE, LIBELLES_FREQUENCE, LIBELLES_TYPE } from "@/lib/format";
import { Frequence, TypeCaisse } from "@/lib/generated/prisma/enums";
import { BALISES_RELANCE, construireMessage, modeleParDefaut } from "@/lib/relance";
import { FREQUENCES_PROPOSEES } from "@/lib/validation/caisse";
import { cn } from "@/lib/utils";
import { CLASSE_LISTE, CLASSE_ZONE_TEXTE } from "@/components/cotiz/styles";
import { ChoixPersonne, type PersonneChoisissable } from "@/components/cotiz/choix-personne";

type Action = (etat: EtatFormulaireCaisse, formData: FormData) => Promise<EtatFormulaireCaisse>;

// Sélecteur natif : sur iPhone, il ouvre la roue de sélection du système.
export function FormulaireCaisse({
  action,
  valeursInitiales = {},
  typeVerrouille = false,
  libelleBouton,
  personnes = [],
}: {
  action: Action;
  valeursInitiales?: Record<string, string>;
  typeVerrouille?: boolean;
  libelleBouton: string;
  /** Création d'un compte gardé : les personnes parmi lesquelles choisir le titulaire. */
  personnes?: PersonneChoisissable[];
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const valeurs = etat?.valeurs ?? valeursInitiales;
  const erreurs = etat?.erreurs ?? {};

  const [type, setType] = useState(valeurs.type ?? TypeCaisse.TONTINE);
  const [frequence, setFrequence] = useState(valeurs.frequence ?? Frequence.MENSUELLE);
  // Date limite déjà passée : acceptée (collecte déjà eue lieu), mais signalée.
  const [dateDepassee, setDateDepassee] = useState(() => estPassee(valeurs.dateLimite));

  return (
    <form action={envoyer} className="flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2" disabled={typeVerrouille}>
        <legend className="mb-2 text-sm font-medium">Type de caisse</legend>
        <div className="grid grid-cols-3 gap-2">
          {[TypeCaisse.TONTINE, TypeCaisse.COLLECTE, TypeCaisse.COMPTE_GARDE].map((t) => (
            <label
              key={t}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-1 text-center text-sm leading-tight sm:text-base",
                type === t && "border-primary bg-primary text-primary-foreground",
                typeVerrouille && "cursor-not-allowed opacity-70",
              )}
            >
              <input
                type="radio"
                name="type"
                value={t}
                aria-label={LIBELLES_TYPE[t]}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              {LIBELLES_TYPE[t]}
            </label>
          ))}
        </div>
        {typeVerrouille && <p className="text-sm text-muted-foreground">Le type ne peut pas être changé après la création.</p>}
        <Erreur message={erreurs.type} />
      </fieldset>
      {/* Hors du fieldset : un navigateur n'envoie jamais les champs d'un fieldset désactivé. */}
      {typeVerrouille && <input type="hidden" name="type" value={type} />}

      <Champ id="nom" label="Nom de la caisse" erreur={erreurs.nom}>
        <Input id="nom" name="nom" defaultValue={valeurs.nom} aria-invalid={Boolean(erreurs.nom)} className="h-11 text-base" />
      </Champ>

      {type === TypeCaisse.COMPTE_GARDE ? (
        <>
          {!typeVerrouille && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Pour qui gardes-tu l&apos;argent ?</p>
              <ChoixPersonne personnes={personnes} name="titulaireId" valeurInitiale={valeurs.titulaireId ?? null} libelle="Titulaire du compte" />
              <p className="text-sm text-muted-foreground">
                Ni montant ni échéance : tu notes ses versements et ce que tu lui rends, Cotiz tient le solde.
              </p>
              <Erreur message={erreurs.titulaireId} />
            </div>
          )}
        </>
      ) : (
      <>
      <Champ id="montantCotisation" label="Montant par membre (FCFA)" erreur={erreurs.montantCotisation}>
        <Input
          id="montantCotisation"
          name="montantCotisation"
          inputMode="numeric"
          placeholder="10 000"
          defaultValue={valeurs.montantCotisation}
          aria-invalid={Boolean(erreurs.montantCotisation)}
          className="h-11 text-base"
        />
      </Champ>

      {type === TypeCaisse.TONTINE ? (
        <>
          <Champ id="frequence" label="Fréquence" erreur={erreurs.frequence}>
            <select
              id="frequence"
              name="frequence"
              value={frequence}
              onChange={(e) => setFrequence(e.target.value as Frequence)}
              aria-invalid={Boolean(erreurs.frequence)}
              className={CLASSE_LISTE}
            >
              {FREQUENCES_PROPOSEES.map((f) => (
                <option key={f} value={f}>
                  {LIBELLES_FREQUENCE[f]}
                </option>
              ))}
            </select>
          </Champ>

          {frequence === Frequence.MENSUELLE ? (
            <Champ id="jourEcheance" label="Jour d'échéance (1 à 31)" erreur={erreurs.jourEcheance}>
              <Input
                id="jourEcheance"
                name="jourEcheance"
                inputMode="numeric"
                placeholder="5"
                defaultValue={valeurs.jourEcheance}
                aria-invalid={Boolean(erreurs.jourEcheance)}
                className="h-11 text-base"
              />
              <p className="text-sm text-muted-foreground">Si le mois est plus court, le dernier jour du mois est utilisé.</p>
            </Champ>
          ) : (
            <Champ id="jourEcheance" label="Jour d'échéance" erreur={erreurs.jourEcheance}>
              <select
                id="jourEcheance"
                name="jourEcheance"
                defaultValue={valeurs.jourEcheance ?? "6"}
                aria-invalid={Boolean(erreurs.jourEcheance)}
                className={CLASSE_LISTE}
              >
                {JOURS_SEMAINE.map((jour, i) => (
                  <option key={jour} value={String(i + 1)}>
                    {jour}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </>
      ) : (
        <Champ id="dateLimite" label="Date limite" erreur={erreurs.dateLimite}>
          <Input
            id="dateLimite"
            name="dateLimite"
            type="date"
            defaultValue={valeurs.dateLimite}
            onChange={(e) => setDateDepassee(estPassee(e.target.value))}
            aria-invalid={Boolean(erreurs.dateLimite)}
            className="h-11 text-base"
          />
          {dateDepassee && (
            <p role="status" className="text-sm text-avertissement">
              Attention : cette date est déjà passée. La collecte sera tout de même enregistrée.
            </p>
          )}
        </Champ>
      )}

      <ChampModeleRelance valeurInitiale={valeurs.modeleRelance ?? ""} nomCaisse={valeurs.nom} type={type === TypeCaisse.COLLECTE ? "COLLECTE" : "TONTINE"} erreur={erreurs.modeleRelance} />
      </>
      )}

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      <Button type="submit" disabled={enCours} className="h-11 text-base">
        {enCours ? "Enregistrement…" : libelleBouton}
      </Button>
    </form>
  );
}

/** Modèle de relance de la caisse, avec un aperçu sur un exemple (vide = modèle par défaut). */
function ChampModeleRelance({
  valeurInitiale,
  nomCaisse,
  type,
  erreur,
}: {
  valeurInitiale: string;
  nomCaisse?: string;
  type: "TONTINE" | "COLLECTE";
  erreur?: string;
}) {
  const [modele, setModele] = useState(valeurInitiale);
  // Deux exemples : une personne qui a avancé une partie, une autre qui n'a rien versé.
  const exemple = { caisse: nomCaisse || "Ma caisse", cycle: 8, montant: 10_000, echeance: new Date("2026-11-05T00:00:00.000Z"), type };
  const apercus = [
    construireMessage(modele, { ...exemple, nom: "Awa Diop", reste: 4_000 }),
    construireMessage(modele, { ...exemple, nom: "Cheikh Ndour", reste: 10_000 }),
  ];
  return (
    <details open={Boolean(valeurInitiale)} className="rounded-2xl bg-card p-3  ring-1 ring-border">
      <summary className="flex h-11 cursor-pointer items-center text-sm font-medium">Message de relance WhatsApp</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Laisse vide pour le message par défaut. Balises : {BALISES_RELANCE.map((b) => `{${b}}`).join(", ")} ({"{montant}"} = cotisation, {"{reste}"} = reste à
          verser, {"{a_verser}"} = « tu dois verser … » si rien n&apos;est versé, sinon « il te reste … à verser sur … »).
        </p>
        <textarea
          id="modeleRelance"
          name="modeleRelance"
          value={modele}
          onChange={(e) => setModele(e.target.value)}
          rows={4}
          placeholder={modeleParDefaut(type)}
          aria-label="Message de relance"
          aria-invalid={Boolean(erreur)}
          className={CLASSE_ZONE_TEXTE}
        />
        <Erreur message={erreur} />
        <p className="text-sm text-muted-foreground">Aperçu (une avance, puis rien versé) :</p>
        {apercus.map((texte, i) => (
          <p key={i} className="rounded-xl bg-paye/10 p-2.5 text-sm whitespace-pre-wrap">
            {texte}
          </p>
        ))}
      </div>
    </details>
  );
}

/** « 2026-10-01 » est-elle avant aujourd'hui (heure de Dakar = UTC) ? */
function estPassee(dateIso: string | undefined) {
  return Boolean(dateIso && dateIso < new Date().toISOString().slice(0, 10));
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
