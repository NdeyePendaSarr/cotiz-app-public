import type { Metadata } from "next";
import { Suspense } from "react";
import { daterRepriseALaMain } from "@/app/actions/datation";
import { EnTete } from "@/components/cotiz/en-tete";
import { Bloc } from "@/components/cotiz/section";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { CLASSE_LISTE } from "@/components/cotiz/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { modeleOrangeMoney } from "@/lib/capture/modele-orange-money";
import { modeleWave } from "@/lib/capture/modele-wave";
import { versesADater } from "@/lib/donnees/rapprochement";
import { formaterFCFA, formaterJourCourt, LIBELLES_CANAL, versChampDate } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";
import { FormulaireOrangeMoney, FormulairesWave } from "./formulaires-wave";

export const metadata: Metadata = { title: "Dater les versés · Cotiz" };

// Rattrapage après un import : les versés de la liste n'ont pas de date de paiement. La trésorière
// les date selon le canal de chaque ligne : SMS Wave collé (ou déjà dans Cotiz), date saisie pour
// Orange Money (ses SMS ne sont pas lus) et les espèces.
export default function PageADater() {
  return (
    <>
      <EnTete leger retour={{ href: "/tableau-de-bord", libelle: "Accueil" }} titre="Dater les versés importés" />
      <Suspense fallback={<SqueletteListe />}>
        <Liste />
      </Suspense>
    </>
  );
}


async function Liste() {
  const { id: ownerId } = await exigerUtilisatrice();
  const { verses, sms } = await versesADater(ownerId);
  if (verses.length === 0) return <p role="status" className="text-muted-foreground">Tous les versés de tes listes importées ont une date.</p>;
  const maxDate = versChampDate(aujourdhui());

  return (
    <>
      <p className="text-muted-foreground">
        {verses.length} versé{verses.length > 1 ? "s" : ""} de ta liste sans date de paiement. Selon le canal de chaque ligne : colle le SMS Wave ou
        complète le modèle (Wave, Orange Money) depuis l&apos;application ; pour les espèces, saisis la date. Seule la date change : le montant et la cotisation réglée restent les mêmes.
      </p>
      <ul className="flex flex-col gap-3">
        {verses.map((v) => {
          // SMS déjà dans Cotiz (ignorés, libres) du même canal : de la même personne d'abord, puis du même montant.
          const rang = (s: (typeof sms)[number]) => (s.personneReconnue === v.personneId ? 0 : s.montant === v.montant ? 1 : 2);
          const options = sms.filter((s) => s.canal === v.canal).sort((a, b) => rang(a) - rang(b));
          const action = daterRepriseALaMain.bind(null, v.id);
          const champDate = (libelle: string) => (
            <form action={action} className="flex flex-col gap-2 pt-3">
              <label htmlFor={`date-${v.id}`} className="text-sm font-medium">
                {libelle}
              </label>
              <div className="flex gap-2">
                <Input id={`date-${v.id}`} type="date" name="date" max={maxDate} required className="h-11 flex-1 text-base" />
                <Button type="submit" variant="outline" className="h-11 text-base">
                  Dater
                </Button>
              </div>
            </form>
          );
          return (
            <li key={v.id}>
              <Bloc className="flex flex-col gap-3 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{v.personne?.nomComplet ?? "Personne inconnue"}</span>
                    <span className="text-xs text-muted-foreground">
                      {v.caisse ?? "—"} · {LIBELLES_CANAL[v.canal]}
                    </span>
                  </span>
                  <span className="shrink-0 font-heading font-bold">{formaterFCFA(v.montant)}</span>
                </div>

                {/* Wave : SMS collé, ou ce qu'affiche l'application Wave (date, heure, ID de transaction). */}
                {v.canal === "WAVE" && (
                  <FormulairesWave
                    repriseId={v.id}
                    modele={modeleWave({ montant: v.montant, nom: v.personne?.nomComplet ?? null, numero: v.personne?.numeros[0]?.numero ?? null, aujourdhui: aujourdhui() })}
                  />
                )}

                {options.length > 0 && (
                  <form action={action} className="flex flex-col gap-2 pt-3">
                    <label htmlFor={`sms-${v.id}`} className="text-sm font-medium">
                      {v.canal === "WAVE" ? "Ou choisis un SMS déjà collé (ignoré)" : "Choisis le paiement déjà saisi (ignoré)"}
                    </label>
                    <select id={`sms-${v.id}`} name="smsId" defaultValue="" className={CLASSE_LISTE}>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {rang(s) === 0 ? "★ " : ""}
                          {formaterJourCourt(s.dateReception)} · {formaterFCFA(s.montant)} · {s.nomExpediteur ?? (s.telephoneExpediteur ? formaterTelephone(s.telephoneExpediteur) : "expéditeur inconnu")}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="outline" className="h-11 text-base">
                      Dater avec celui-ci
                    </Button>
                  </form>
                )}

                {/* Orange Money : Cotiz ne lit pas ses SMS, on saisit la date. Espèces : pas de SMS. Wave : en dernier recours. */}
                {v.canal === "ORANGE_MONEY" && (
                  <>
                    <FormulaireOrangeMoney
                      repriseId={v.id}
                      modele={modeleOrangeMoney({ montant: v.montant, nom: v.personne?.nomComplet ?? null, numero: v.personne?.numeros[0]?.numero ?? null, aujourdhui: aujourdhui() })}
                    />
                    <details>
                      <summary className="flex h-11 cursor-pointer items-center text-sm text-muted-foreground">Sans l&apos;application : saisir seulement la date</summary>
                      {champDate("Date du paiement Orange Money")}
                    </details>
                  </>
                )}
                {v.canal === "CASH" && champDate("Date du paiement en espèces")}
                {v.canal === "WAVE" && (
                  <details>
                    <summary className="flex h-11 cursor-pointer items-center text-sm text-muted-foreground">Ni SMS ni application : saisir seulement la date</summary>
                    {champDate("Date du paiement")}
                  </details>
                )}
              </Bloc>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">★ : SMS reconnu comme venant de cette personne (numéro ou nom connu).</p>
    </>
  );
}
