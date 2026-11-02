"use client";

import { CalendarCheck, Link2 } from "lucide-react";
import { useActionState, useState } from "react";
import { daterRepriseAvecSms, daterRepriseDepuisModele, daterRepriseDepuisModeleOrangeMoney, type EtatDatationWave } from "@/app/actions/datation";
import { CLASSE_ZONE_TEXTE } from "@/components/cotiz/styles";
import { Button } from "@/components/ui/button";


/**
 * Ligne Wave de la page « Dater les versés » : coller le SMS, ou compléter le modèle prérempli
 * (format du SMS Wave) avec la date, l'heure et l'ID de transaction de l'application Wave. Les textes
 * restent remplis après une réponse du serveur, pour confirmer « rattacher ici » sans tout ressaisir.
 */
export function FormulairesWave({ repriseId, modele }: { repriseId: string; modele: string }) {
  const [etatSms, envoyerSms, enCoursSms] = useActionState(daterRepriseAvecSms.bind(null, repriseId), undefined);
  const [etatApp, envoyerApp, enCoursApp] = useActionState(daterRepriseDepuisModele.bind(null, repriseId), undefined);
  const [texte, setTexte] = useState("");
  const [texteApp, setTexteApp] = useState(modele);

  return (
    <>
      <form action={envoyerSms} className="flex flex-col gap-2 pt-3">
        <label htmlFor={`texte-${repriseId}`} className="text-sm font-medium">
          Colle le SMS Wave de ce paiement
        </label>
        <textarea
          id={`texte-${repriseId}`}
          name="texte"
          rows={3}
          required
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Vous avez recu 2.000F de…"
          className={CLASSE_ZONE_TEXTE}
        />
        <Reponse etat={etatSms} />
        <Button type="submit" disabled={enCoursSms} className="h-11 text-base">
          <CalendarCheck aria-hidden />
          {enCoursSms ? "Lecture…" : "Dater avec ce SMS"}
        </Button>
      </form>

      <details>
        <summary className="flex h-11 cursor-pointer items-center text-sm font-medium text-primary">Pas de SMS : depuis l&apos;application Wave</summary>
        <form action={envoyerApp} className="flex flex-col gap-2 pb-2">
          <p className="text-sm text-muted-foreground">
            Ouvre la transaction dans l&apos;application Wave, puis dans ce modèle remplace <strong>JJ</strong> et <strong>HHhMM</strong> par la date
            et l&apos;heure, et complète l&apos;<strong>ID de transaction</strong> (tel qu&apos;affiché, avec T_ et le tiret). Le montant et le nom
            sont déjà là. Inutile d&apos;envoyer la capture : elle montre ton solde.
          </p>
          <label htmlFor={`modele-${repriseId}`} className="sr-only">
            Modèle à compléter
          </label>
          <textarea
            id={`modele-${repriseId}`}
            name="texte"
            rows={4}
            required
            value={texteApp}
            onChange={(e) => setTexteApp(e.target.value)}
            className={CLASSE_ZONE_TEXTE}
          />
          <Reponse etat={etatApp} />
          <Button type="submit" variant="outline" disabled={enCoursApp} className="h-11 text-base">
            {enCoursApp ? "Lecture…" : "Dater avec ces informations"}
          </Button>
        </form>
      </details>
    </>
  );
}

/**
 * Ligne Orange Money : modèle prérempli (montant, nom) à compléter avec la date, l'heure et la
 * référence « PP… » de l'application Orange Money (son SMS ne porte pas la date).
 */
export function FormulaireOrangeMoney({ repriseId, modele }: { repriseId: string; modele: string }) {
  const [etat, envoyer, enCours] = useActionState(daterRepriseDepuisModeleOrangeMoney.bind(null, repriseId), undefined);
  const [texte, setTexte] = useState(modele);
  return (
    <form action={envoyer} className="flex flex-col gap-2 pt-3">
      <label htmlFor={`om-${repriseId}`} className="text-sm font-medium">
        Depuis l&apos;application Orange Money
      </label>
      <p className="text-sm text-muted-foreground">
        Ouvre la transaction dans Orange Money, puis remplace <strong>JJ</strong> et <strong>HHhMM</strong> par la date et l&apos;heure, et
        complète la <strong>Référence</strong> (elle commence par PP). Le SMS Orange Money ne donne pas la date : l&apos;application, si.
      </p>
      <textarea id={`om-${repriseId}`} name="texte" rows={3} required value={texte} onChange={(e) => setTexte(e.target.value)} className={CLASSE_ZONE_TEXTE} />
      <Reponse etat={etat} />
      <Button type="submit" disabled={enCours} className="h-11 text-base">
        <CalendarCheck aria-hidden />
        {enCours ? "Lecture…" : "Dater avec ces informations"}
      </Button>
    </form>
  );
}

/** Erreur, ou conflit précis avec, s'il est permis, le bouton « rattacher ici ». */
function Reponse({ etat }: { etat: EtatDatationWave }) {
  if (etat?.erreur) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {etat.erreur}
      </p>
    );
  }
  if (!etat?.conflit) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-avertissement/10 p-3 text-sm ring-1 ring-avertissement/30">
      <p>{etat.conflit.message}</p>
      {etat.conflit.rattachable && (
        // Bouton d'envoi simple (pas de formAction) : il peut porter name/value.
        <Button type="submit" name="rattacher" value="1" variant="outline" className="h-11 text-base">
          <Link2 aria-hidden />
          C&apos;est bien son paiement : le rattacher ici
        </Button>
      )}
    </div>
  );
}
