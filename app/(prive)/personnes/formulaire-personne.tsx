"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { inscrirePersonneExistante } from "@/app/actions/membres";
import type { EtatFormulairePersonne } from "@/app/actions/personnes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formaterTelephone } from "@/lib/telephone";
import { MAX_ALIAS, MAX_NUMEROS } from "@/lib/validation/personne";

type Action = (etat: EtatFormulairePersonne, formData: FormData) => Promise<EtatFormulairePersonne>;
type Valeurs = { nomComplet: string; cellule?: string; numeros: { numero: string; libelle: string }[]; aliasWave: string[] };

// Identifiant stable de chaque ligne (clé React), pour que retirer une ligne ne décale pas les autres.
let compteurLignes = 0;
const avecId = <T,>(v: T) => ({ id: compteurLignes++, ...v });

// Champs contrôlés (valeur gardée dans l'état React) : les lignes ajoutées ou retirées
// survivent ainsi à un aller-retour serveur (erreurs, doublons à confirmer).
export function FormulairePersonne({
  action,
  valeursInitiales,
  caisseId,
  libelleBouton,
}: {
  action: Action;
  valeursInitiales?: Valeurs;
  /** Ajout depuis la page d'une caisse : permet d'inscrire une personne existante trouvée en doublon. */
  caisseId?: string;
  libelleBouton: string;
}) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  const erreurs = etat?.erreurs ?? {};

  const depart = valeursInitiales ?? { nomComplet: "", numeros: [{ numero: "", libelle: "" }], aliasWave: [] };
  const [nomComplet, setNomComplet] = useState(depart.nomComplet);
  const [cellule, setCellule] = useState(depart.cellule ?? "");
  const [numeros, setNumeros] = useState(() => depart.numeros.map(avecId));
  const [alias, setAlias] = useState(() => depart.aliasWave.map((valeur) => avecId({ valeur })));

  const doublons = etat?.doublons;

  return (
    <form action={envoyer} className="flex flex-col gap-5" noValidate>
      {caisseId && <input type="hidden" name="caisseId" value={caisseId} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nomComplet">Nom complet</Label>
        <Input
          id="nomComplet"
          name="nomComplet"
          value={nomComplet}
          onChange={(e) => setNomComplet(e.target.value)}
          aria-invalid={Boolean(erreurs.nomComplet)}
          className="h-11 text-base"
        />
        <Erreur message={erreurs.nomComplet} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cellule">
          Cellule <span className="font-normal text-muted-foreground">(facultatif)</span>
        </Label>
        <Input
          id="cellule"
          name="cellule"
          value={cellule}
          onChange={(e) => setCellule(e.target.value)}
          placeholder="Organisation"
          maxLength={50}
          aria-invalid={Boolean(erreurs.cellule)}
          className="h-11 text-base"
        />
        <Erreur message={erreurs.cellule} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Numéros Wave / Orange Money</legend>
        {numeros.map((ligne, i) => (
          <div key={ligne.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3  ring-1 ring-border">
            <div className="flex gap-2">
              <Input
                name="numero"
                inputMode="tel"
                placeholder="77 123 45 67"
                aria-label={`Numéro ${i + 1}`}
                value={ligne.numero}
                onChange={(e) => setNumeros((l) => l.map((x) => (x.id === ligne.id ? { ...x, numero: e.target.value } : x)))}
                aria-invalid={Boolean(erreurs[`numeros.${i}.numero`])}
                className="h-11 text-base"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                aria-label={`Retirer le numéro ${i + 1}`}
                onClick={() => setNumeros((l) => l.filter((x) => x.id !== ligne.id))}
              >
                Retirer
              </Button>
            </div>
            <Input
              name="libelle"
              placeholder="Libellé facultatif (ex. numéro du mari)"
              aria-label={`Libellé du numéro ${i + 1}`}
              value={ligne.libelle}
              onChange={(e) => setNumeros((l) => l.map((x) => (x.id === ligne.id ? { ...x, libelle: e.target.value } : x)))}
              className="h-11 text-base"
            />
            <Erreur message={erreurs[`numeros.${i}.numero`] ?? erreurs[`numeros.${i}.libelle`]} />
          </div>
        ))}
        <Erreur message={erreurs.numeros} />
        {numeros.length < MAX_NUMEROS && (
          <Button
            type="button"
            variant="outline"
            className="h-11 text-base"
            onClick={() => setNumeros((l) => [...l, avecId({ numero: "", libelle: "" })])}
          >
            Ajouter un numéro
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Alias Wave</legend>
        <p className="text-sm text-muted-foreground">
          Noms sous lesquels ses paiements arrivent : nom de jeune fille, nom d&apos;épouse, surnom, proche qui paie pour elle.
        </p>
        {alias.map((ligne, i) => (
          <div key={ligne.id} className="flex gap-2">
            <Input
              name="alias"
              aria-label={`Alias ${i + 1}`}
              value={ligne.valeur}
              onChange={(e) => setAlias((l) => l.map((x) => (x.id === ligne.id ? { ...x, valeur: e.target.value } : x)))}
              aria-invalid={Boolean(erreurs[`aliasWave.${i}`])}
              className="h-11 text-base"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0"
              aria-label={`Retirer l'alias ${i + 1}`}
              onClick={() => setAlias((l) => l.filter((x) => x.id !== ligne.id))}
            >
              Retirer
            </Button>
          </div>
        ))}
        <Erreur message={erreurs.aliasWave} />
        {alias.length < MAX_ALIAS && (
          <Button
            type="button"
            variant="outline"
            className="h-11 text-base"
            onClick={() => setAlias((l) => [...l, avecId({ valeur: "" })])}
          >
            Ajouter un alias
          </Button>
        )}
      </fieldset>

      {doublons && (
        <section role="alert" className="flex flex-col gap-3 rounded-xl border border-avertissement/40 bg-avertissement/10 p-4">
          <h2 className="font-semibold">Cette personne existe peut-être déjà</h2>
          {doublons.memeNumero.length > 0 && (
            <ListeDoublons
              titre="Même numéro"
              personnes={doublons.memeNumero.map((d) => ({ id: d.id, nomComplet: d.nomComplet, detail: formaterTelephone(d.numero) }))}
              caisseId={caisseId}
            />
          )}
          {doublons.memeNom.length > 0 && (
            <ListeDoublons
              titre="Même nom (peut-être un homonyme)"
              personnes={doublons.memeNom.map((d) => ({ id: d.id, nomComplet: d.nomComplet }))}
              caisseId={caisseId}
            />
          )}
          <Button type="submit" name="confirmer" value="oui" variant="outline" disabled={enCours} className="h-11 text-base">
            Non, c&apos;est une autre personne : enregistrer
          </Button>
        </section>
      )}

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      {/* Après un avertissement de doublon, ce bouton revérifie (utile si la saisie a été corrigée). */}
      <Button type="submit" disabled={enCours} variant={doublons ? "outline" : "default"} className="h-11 text-base">
        {enCours ? "Enregistrement…" : doublons ? "J'ai corrigé : vérifier à nouveau" : libelleBouton}
      </Button>
    </form>
  );
}

function ListeDoublons({
  titre,
  personnes,
  caisseId,
}: {
  titre: string;
  personnes: { id: string; nomComplet: string; detail?: string }[];
  caisseId?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{titre}</p>
      <ul className="flex flex-col gap-2">
        {personnes.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-lg bg-background p-3">
            <span>
              <Link href={`/personnes/${p.id}`} className="underline underline-offset-4">
                {p.nomComplet}
              </Link>
              {p.detail && <span className="text-muted-foreground"> · {p.detail}</span>}
            </span>
            {caisseId && (
              // formAction : ce bouton envoie le formulaire à une autre Server Action, avec les
              // identifiants liés par bind (un bouton à formAction ne peut pas porter name/value).
              <Button type="submit" formAction={inscrirePersonneExistante.bind(null, caisseId, p.id)} className="h-11 text-base">
                Oui, inscrire cette personne
              </Button>
            )}
          </li>
        ))}
      </ul>
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
