"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { EtatImportCompte } from "@/app/actions/comptes";
import { Pastille } from "@/components/cotiz/pastille";
import { CLASSE_LISTE, CLASSE_ZONE_TEXTE, TABLEAU } from "@/components/cotiz/styles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { LIBELLES_SENS } from "@/lib/comptes";
import { refusFichier } from "@/lib/import/fichier";
import { cn } from "@/lib/utils";

type Action = (etat: EtatImportCompte, formData: FormData) => Promise<EtatImportCompte>;

/**
 * Reprise de l'historique d'un compte gardé (tableau Word ou Excel collé) : aperçu d'abord, puis
 * import. Colonnes reconnues : date, versement / retrait (ou montant + sens), canal, note.
 */
export function FormulaireImportCompte({ action, caisseId }: { action: Action; caisseId: string }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  // Contrôlé : le texte collé survit aux allers-retours de l'aperçu.
  const [texte, setTexte] = useState("");
  const [canal, setCanal] = useState("");

  // Envoi par onSubmit (et non action=) : React ne remet pas le formulaire à zéro après l'aperçu,
  // le canal choisi reste sélectionné pour l'import. Le bouton cliqué (intention) est envoyé avec.
  function soumettre(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const donnees = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => envoyer(donnees));
  }
  const [refusFichierChoisi, setRefusFichier] = useState<string | null>(null);
  const apercu = etat?.apercu;

  if (etat?.termine) {
    const t = etat.termine;
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
        <h2 className="font-heading text-base font-semibold">
          {t.importes} mouvement{t.importes > 1 ? "s" : ""} importé{t.importes > 1 ? "s" : ""}
        </h2>
        <p className="text-muted-foreground">
          Versements : {formaterFCFA(t.versements)} · retraits : {formaterFCFA(t.retraits)}.
        </p>
        <Link href={`/caisses/${caisseId}`} className={cn(buttonVariants(), "h-11 text-base")}>
          Voir le compte
        </Link>
      </section>
    );
  }

  async function lireFichier(entree: HTMLInputElement) {
    const fichier = entree.files?.[0];
    if (!fichier) return;
    const contenu = await fichier.text();
    const refus = refusFichier(fichier.name, contenu);
    setRefusFichier(refus);
    if (refus) entree.value = "";
    else setTexte(contenu);
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="texte">Colle le tableau (Word ou Excel)</Label>
        <textarea
          id="texte"
          name="texte"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={8}
          placeholder={"Date\tVersement\tRetrait\tCanal\tNote\n05/01/2026\t50 000\t\tWave\n20/01/2026\t\t20 000\tCash\tLoyer"}
          className={CLASSE_ZONE_TEXTE}
        />
        <p className="text-sm text-muted-foreground">
          Une ligne par mouvement : la date, puis le montant dans une colonne « Versement » ou « Retrait » (ou une colonne « Montant » et une colonne qui dit
          « reçu » ou « envoyé »). Canal et note sont facultatifs. Les lignes de total sont ignorées.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Ou choisis un fichier texte (.txt, .csv)</span>
          <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => lireFichier(e.currentTarget)} className="min-h-11 text-sm" />
        </label>
        {refusFichierChoisi && (
          <p role="alert" className="text-sm text-destructive">
            {refusFichierChoisi}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="canal">Canal des lignes sans canal</Label>
        <select id="canal" name="canal" value={canal} onChange={(e) => setCanal(e.target.value)} className={CLASSE_LISTE}>
          <option value="">Choisir…</option>
          {(Object.keys(LIBELLES_CANAL) as (keyof typeof LIBELLES_CANAL)[]).map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CANAL[c]}
            </option>
          ))}
        </select>
      </div>

      {apercu && (
        <section aria-label="Aperçu" className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="font-semibold">
            {apercu.aImporter} mouvement{apercu.aImporter > 1 ? "s" : ""} à importer : +{formaterFCFA(apercu.versements)}, −{formaterFCFA(apercu.retraits)}
          </p>
          {apercu.sansCanal > 0 && (
            <p className="text-sm text-avertissement">
              {apercu.sansCanal} ligne{apercu.sansCanal > 1 ? "s" : ""} sans canal : le canal choisi ci-dessus sera utilisé.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className={TABLEAU.table}>
              <thead className={TABLEAU.entete}>
                <tr>
                  <th scope="col" className={TABLEAU.colonne}>Ligne</th>
                  <th scope="col" className={TABLEAU.colonne}>Date</th>
                  <th scope="col" className={TABLEAU.colonne}>Mouvement</th>
                  <th scope="col" className={TABLEAU.colonne}>Canal</th>
                  <th scope="col" className={cn(TABLEAU.colonne, "text-right")}>Montant</th>
                  <th scope="col" className={TABLEAU.colonne}>État</th>
                </tr>
              </thead>
              <tbody className={TABLEAU.corps}>
                {apercu.lignes.map((l) => (
                  <tr key={l.numero} className={cn(TABLEAU.ligne, (l.erreur || l.dejaEnregistre) && "text-muted-foreground")}>
                    <td className="pr-3 tabular-nums">{l.numero}</td>
                    <td className="pr-3 whitespace-nowrap">{l.date ? new Date(`${l.date}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "–"}</td>
                    <td className="pr-3">{l.sens ? LIBELLES_SENS[l.sens] : "–"}</td>
                    <td className="pr-3">{l.canal ? LIBELLES_CANAL[l.canal] : apercu.canal ? `${LIBELLES_CANAL[apercu.canal]} (choisi)` : "–"}</td>
                    <td className="pr-3 text-right whitespace-nowrap tabular-nums">{l.montant ? formaterFCFA(l.montant) : "–"}</td>
                    <td className="py-2">
                      {l.erreur ? (
                        <span className="text-sm text-destructive">{l.erreur}</span>
                      ) : l.dejaEnregistre ? (
                        <Pastille ton="neutre">Déjà enregistré</Pastille>
                      ) : (
                        <Pastille ton="paye">À importer</Pastille>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {etat?.erreur && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {etat.erreur}
        </p>
      )}
      <Button type="submit" name="intention" value="analyser" variant={apercu ? "outline" : "default"} disabled={enCours} className="h-11 text-base">
        {enCours ? "Analyse…" : apercu ? "Analyser à nouveau" : "Voir l'aperçu"}
      </Button>
      {apercu && (
        <Button type="submit" name="intention" value="importer" disabled={enCours || apercu.aImporter === 0} className="h-11 text-base">
          Importer {apercu.aImporter} mouvement{apercu.aImporter > 1 ? "s" : ""}
        </Button>
      )}
    </form>
  );
}
