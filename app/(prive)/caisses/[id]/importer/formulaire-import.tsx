"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { EtatImport } from "@/app/actions/import";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LIBELLES_STATUT, lignesACompleter, type Comparaison, type LigneAnalysee } from "@/lib/import/analyse";
import { refusFichier } from "@/lib/import/fichier";
import { LIBELLES_ROLE, ROLES } from "@/lib/import/tableau";
import { formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";
import { cn } from "@/lib/utils";
import { Pastille, type Ton } from "@/components/cotiz/pastille";
import { CLASSE_LISTE, CLASSE_ZONE_TEXTE } from "@/components/cotiz/styles";

type Action = (etat: EtatImport, formData: FormData) => Promise<EtatImport>;
type Apercu = NonNullable<NonNullable<EtatImport>["apercu"]>;

/**
 * Import d'une liste (refonte du 31/10/2026). Grand écran (xl, 1 280 px) : à gauche un panneau
 * d'étapes qui reste visible (coller, colonnes, canal, boutons), à droite l'aperçu filtrable.
 * Écran plus étroit et téléphone : les étapes, puis l'aperçu, puis les boutons.
 */
export function FormulaireImport({ action, caisseId, tontine }: { action: Action; caisseId: string; tontine: boolean }) {
  const [etat, envoyer, enCours] = useActionState(action, undefined);
  // Contrôlé : le texte collé survit aux allers-retours de l'aperçu.
  const [texte, setTexte] = useState("");
  const [refusFichierChoisi, setRefusFichier] = useState<string | null>(null);
  const apercu = etat?.apercu;
  // Membres déjà inscrits que le réimport complète (cellule, numéro ou versé).
  const aCompleter = apercu ? lignesACompleter(apercu.lignes).length : 0;

  if (etat?.termine) {
    const t = etat.termine;
    return (
      <section role="status" className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
        <h2 className="font-heading text-base font-semibold">{t.importes > 0 ? `${t.importes} membre(s) importé(s)` : "Mise à jour terminée"}</h2>
        <p className="text-muted-foreground">
          {t.nouvelles} nouvelle(s) personne(s), {t.existantes} personne(s) existante(s) réutilisée(s), {t.reactivations} réactivation(s).
        </p>
        {t.verses > 0 && (
          <p className="font-medium">
            {t.verses} paiement(s) déjà versé(s) enregistré(s) et rapproché(s) : {formaterFCFA(t.totalVerse)}
            {t.bonnesVolontes > 0 && `, dont ${formaterFCFA(t.bonnesVolontes)} en bonnes volontés`}.
          </p>
        )}
        {t.canauxCorriges > 0 && <p className="font-medium">{t.canauxCorriges} paiement(s) déjà repris : canal corrigé d&apos;après la liste.</p>}
        <Link href={`/caisses/${caisseId}`} className={cn(buttonVariants(), "h-11 text-base")}>
          Voir la caisse
        </Link>
      </section>
    );
  }

  // Fichier choisi : seul du texte est lu ; un document Word ou Excel est refusé avec la marche à suivre.
  async function lireFichier(entree: HTMLInputElement) {
    const fichier = entree.files?.[0];
    if (!fichier) return;
    const contenu = await fichier.text();
    const refus = refusFichier(fichier.name, contenu);
    setRefusFichier(refus);
    if (refus) entree.value = ""; // permet de rechoisir un fichier, et ne garde pas le mauvais
    else setTexte(contenu);
  }

  // Deux exemplaires (panneau sur grand écran, bas de page sinon) : mêmes boutons du même formulaire.
  const actions = (classe: string) => (
    <div className={cn("flex-col gap-2", classe)}>
      {etat?.erreur && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {etat.erreur}
        </p>
      )}
      <Button type="submit" name="intention" value="analyser" variant={apercu ? "outline" : "default"} disabled={enCours} className="h-11 text-base">
        {enCours ? "Analyse…" : apercu ? "Analyser à nouveau" : "Analyser la liste"}
      </Button>
      {apercu && (
        <Button type="submit" name="intention" value="importer" disabled={enCours || (apercu.resume.aImporter === 0 && aCompleter === 0)} className="h-11 text-base">
          {apercu.resume.aImporter > 0 ? `Importer ${apercu.resume.aImporter} membre(s)` : `Mettre à jour ${aCompleter} membre(s)`}
        </Button>
      )}
    </div>
  );

  return (
    <form
      action={envoyer}
      data-pleine-largeur
      className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start xl:gap-8"
    >
      {/* Panneau des étapes : collant sur grand écran, défile tout seul s'il est plus haut que l'écran ;
          les boutons restent collés en bas du panneau. */}
      <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto">
        <Etape numero={1} titre="Colle ta liste">
          <textarea
            id="texte"
            name="texte"
            aria-label="Liste des membres"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={apercu ? 4 : 9}
            wrap="off"
            spellCheck={false}
            placeholder={"Prénom\tNom\tTéléphone\tCellule\tVersé\tCanal\nAwa\tDiop\t77 123 45 67\tTechnique\t2 000\tWave"}
            className={cn(CLASSE_ZONE_TEXTE, "block min-w-0 resize-y overflow-auto font-mono text-sm")}
          />
          <details className="text-sm text-muted-foreground">
            <summary className="flex h-11 cursor-pointer items-center font-medium text-primary">Colonnes reconnues</summary>
            <p className="pb-2">
              Copie les lignes de ton tableau (Word ou Excel), en-tête compris : nom (ou prénom et nom), téléphone
              {tontine ? ", N° / ordre" : ""}, cellule, « Versé » (montant déjà reçu, enregistré comme paiement) et « Canal » (Wave,
              OM, cash) pour le moyen de paiement de chaque versé. La colonne « Montant » (somme convenue) et les autres sont ignorées.
            </p>
          </details>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Ou un fichier .txt ou .csv
            <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => lireFichier(e.currentTarget)} className="min-h-11 text-sm" />
          </label>
          {refusFichierChoisi && (
            <p role="alert" className="rounded-xl bg-avertissement/10 p-3 text-sm font-medium text-avertissement">
              {refusFichierChoisi}
            </p>
          )}
        </Etape>

        {apercu && (
          <Etape numero={2} titre="Vérifie les colonnes" aide="Corrige si besoin, puis « Analyser à nouveau ».">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {apercu.roles.map((role, j) => (
                <div key={`${j}-${role}`} className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor={`role-${j}`} className="block truncate text-xs" title={apercu.exemples[j] ? `ex. « ${apercu.exemples[j]} »` : undefined}>
                    {apercu.enTetes[j] || `Colonne ${j + 1}`}
                  </Label>
                  <select id={`role-${j}`} name={`role-${j}`} defaultValue={role} className={cn(CLASSE_LISTE, "text-base")}>
                    {/* « ordre » reste proposé dans une collecte : sinon une colonne N° détectée s'afficherait
                        sur la première option (« Nom complet ») et serait envoyée comme telle. */}
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r === "ordre" && !tontine ? "N° (ignoré)" : LIBELLES_ROLE[r]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Etape>
        )}

        {apercu && apercu.roles.includes("verse") && (
          <Etape numero={3} titre="Canal des versés">
            <p className="text-sm text-muted-foreground">
              {apercu.resume.verses > 0
                ? `${apercu.resume.verses} paiement(s) à enregistrer : ${formaterFCFA(apercu.resume.totalVerse)}, datés du jour de l'import${apercu.resume.bonnesVolontes > 0 ? `, dont ${formaterFCFA(apercu.resume.bonnesVolontes)} en bonnes volontés` : ""}.`
                : "Aucun versé à enregistrer."}
              {apercu.resume.verses > 0 &&
                (apercu.resume.versesSansCanal === 0
                  ? " Chaque versé a son canal dans la liste."
                  : apercu.resume.versesSansCanal < apercu.resume.verses
                    ? ` ${apercu.resume.versesSansCanal} sans canal dans la liste : ils prendront celui-ci.`
                    : " Ils prendront tous ce canal.")}
              {apercu.resume.canauxCorriges > 0 && ` ${apercu.resume.canauxCorriges} paiement(s) déjà repris d'un import : leur canal sera corrigé d'après la liste.`}
            </p>
            {apercu.resume.versesSansCanal > 0 && (
              <select id="canal" name="canal" aria-label="Canal des versés" defaultValue={apercu.canal ?? ""} className={CLASSE_LISTE}>
                <option value="" disabled>
                  Choisir…
                </option>
                {(Object.keys(LIBELLES_CANAL) as (keyof typeof LIBELLES_CANAL)[]).map((c) => (
                  <option key={c} value={c}>
                    {LIBELLES_CANAL[c]}
                  </option>
                ))}
              </select>
            )}
          </Etape>
        )}

        {actions("hidden xl:sticky xl:bottom-0 xl:flex xl:bg-background xl:pt-1 xl:pb-1")}
      </div>

      {apercu ? (
        <ApercuImport apercu={apercu} />
      ) : (
        <p className="hidden rounded-2xl border-2 border-dashed border-border p-10 text-center text-muted-foreground xl:block">
          Colle ta liste à gauche, puis « Analyser la liste » : l&apos;aperçu des membres s&apos;affichera ici. Rien n&apos;est enregistré avant
          ta confirmation.
        </p>
      )}

      {actions("flex xl:hidden")}
    </form>
  );
}

/** Étape numérotée du panneau de gauche. */
function Etape({ numero, titre, aide, children }: { numero: number; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{numero}</span>
        {titre}
      </h2>
      {aide && <p className="text-sm text-muted-foreground">{aide}</p>}
      {children}
    </section>
  );
}

// Filtres de l'aperçu. « Existantes » regroupe les personnes déjà connues ajoutées et les réactivations.
const FILTRES = [
  { cle: "tous", libelle: "Tous", garder: () => true },
  { cle: "a_choisir", libelle: "À choisir", garder: (l: LigneAnalysee) => l.statut === "a_choisir" },
  { cle: "erreur", libelle: "Erreurs", garder: (l: LigneAnalysee) => l.statut === "erreur" },
  { cle: "nouvelle", libelle: "Nouvelles", garder: (l: LigneAnalysee) => l.statut === "nouvelle" },
  { cle: "existante", libelle: "Existantes", garder: (l: LigneAnalysee) => l.statut === "existante" || l.statut === "reactivation" },
  { cle: "deja_membre", libelle: "Déjà membres", garder: (l: LigneAnalysee) => l.statut === "deja_membre" },
] as const;
type Filtre = (typeof FILTRES)[number]["cle"];

// Ce qui demande une action d'abord : à choisir, puis erreurs, puis le reste dans l'ordre de la liste.
const RANG: Record<LigneAnalysee["statut"], number> = { a_choisir: 0, erreur: 1, nouvelle: 2, existante: 2, reactivation: 2, deja_membre: 2 };

/**
 * Aperçu filtrable. Les lignes filtrées sont seulement masquées (classe hidden), jamais retirées :
 * leurs choix « Qui est-ce ? » restent dans le formulaire envoyé.
 */
function ApercuImport({ apercu }: { apercu: Apercu }) {
  const [filtre, setFiltre] = useState<Filtre>(apercu.resume.aChoisir > 0 ? "a_choisir" : "tous");
  const lignes = [...apercu.lignes].sort((a, b) => RANG[a.statut] - RANG[b.statut] || a.numero - b.numero);
  const garder = FILTRES.find((f) => f.cle === filtre)?.garder ?? (() => true);
  const visibles = lignes.filter(garder).length;

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-heading text-base font-semibold">Aperçu</h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{apercu.resume.aImporter}</span> à importer sur {apercu.resume.total} lignes
        </p>
      </div>

      <div role="tablist" aria-label="Filtrer l'aperçu" className="flex flex-wrap gap-2">
        {FILTRES.map((f) => {
          const nombre = apercu.lignes.filter(f.garder).length;
          if (f.cle !== "tous" && nombre === 0) return null;
          return (
            <button
              key={f.cle}
              type="button"
              role="tab"
              aria-selected={filtre === f.cle}
              onClick={() => setFiltre(f.cle)}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 transition-colors",
                filtre === f.cle ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-border hover:bg-secondary",
                f.cle === "a_choisir" && filtre !== f.cle && "text-avertissement ring-avertissement/40",
                f.cle === "erreur" && filtre !== f.cle && "text-destructive ring-destructive/40",
              )}
            >
              {f.libelle}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtre === f.cle ? "bg-primary-foreground/20" : "bg-muted")}>{nombre}</span>
            </button>
          );
        })}
      </div>

      {/* @container : chaque ligne passe en colonnes selon la largeur réelle de l'aperçu, pas de l'écran. */}
      <ul className="@container divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border">
        {lignes.map((l) => (
          <LigneApercu key={l.numero} ligne={l} choix={apercu.choix[l.numero]} masquee={!garder(l)} />
        ))}
      </ul>
      {visibles === 0 && <p className="text-sm text-muted-foreground">Aucune ligne dans ce filtre.</p>}

      {apercu.ecartees.length > 0 && (
        <details className="rounded-2xl bg-card px-4 ring-1 ring-border">
          <summary className="flex h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground">Lignes écartées ({apercu.ecartees.length})</summary>
          <ul className="flex flex-col gap-1 pb-3 text-sm text-muted-foreground">
            {apercu.ecartees.map((e) => (
              <li key={e.numero}>
                Ligne {e.numero} : {e.raison} (« {e.texte} »)
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// Teinte de la pastille de chaque ligne d'aperçu (components/cotiz/pastille.tsx).
const TON_STATUT: Record<LigneAnalysee["statut"], Ton> = {
  nouvelle: "paye",
  existante: "info",
  reactivation: "info",
  a_choisir: "avertissement",
  deja_membre: "neutre",
  erreur: "retard",
};

const PASTILLES: Record<Comparaison, { texte: (champ: string) => string; ton: Ton }> = {
  identique: { texte: (champ) => `${champ} identique`, ton: "paye" },
  different: { texte: (champ) => `${champ} différent${champ === "Cellule" ? "e" : ""}`, ton: "retard" },
  inconnu: { texte: (champ) => `${champ} : rien à comparer`, ton: "neutre" },
};

/** Ce qui rapproche (vert) ou distingue (rouge) la ligne de la fiche existante. */
function PastilleComparaison({ champ, resultat }: { champ: "Numéro" | "Cellule"; resultat: Comparaison }) {
  const p = PASTILLES[resultat];
  return (
    <Pastille ton={p.ton} className="px-2 py-0.5">
      {p.texte(champ)}
    </Pastille>
  );
}

/** Une ligne de l'aperçu : nom, numéro, cellule, versé et statut ; remarques en petit dessous. */
function LigneApercu({ ligne: l, choix, masquee }: { ligne: LigneAnalysee; choix?: string; masquee: boolean }) {
  const doitChoisir = l.statut === "a_choisir" || (choix !== undefined && l.candidats.length > 0 && l.statut !== "erreur");
  return (
    <li className={cn("flex flex-col gap-1.5 px-4 py-3", masquee && "hidden", l.statut === "a_choisir" && "bg-avertissement/5", l.statut === "erreur" && "bg-destructive/5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 @xl:grid @xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] @xl:items-center">
        <span className="min-w-0 font-semibold">
          {l.ordre !== null && <span className="text-muted-foreground tabular-nums">{l.ordre}. </span>}
          {l.nom}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">ligne {l.numero}</span>
        </span>
        <span className="min-w-0 truncate text-sm text-muted-foreground tabular-nums">
          {l.telephone ? formaterTelephone(l.telephone) : "—"}
          {l.cellule && <span className="font-medium text-primary @xl:hidden"> · {l.cellule}</span>}
        </span>
        <span className="hidden min-w-0 truncate text-sm font-medium text-primary @xl:block">{l.cellule ?? <span className="text-muted-foreground">—</span>}</span>
        <Pastille ton={TON_STATUT[l.statut]} className="ml-auto py-0.5 @xl:ml-0 @xl:justify-self-end">{LIBELLES_STATUT[l.statut]}</Pastille>
      </div>
      {(l.verse !== null || l.messages.length > 0) && (
        <div className="flex flex-col gap-0.5 text-sm">
          {l.verse !== null && (
            <span className="font-semibold text-paye">
              Versé : {formaterFCFA(l.verse)}
              {l.canal && <span className="font-normal text-muted-foreground"> · {LIBELLES_CANAL[l.canal]}</span>}
            </span>
          )}
          {l.messages.map((m) => (
            <span key={m} className="text-muted-foreground">
              {m}
            </span>
          ))}
        </div>
      )}
      {doitChoisir && (
        <fieldset className="mt-1 flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Qui est-ce ? Compare avec la fiche déjà enregistrée :</legend>
          {l.candidats.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-border has-checked:bg-secondary has-checked:ring-primary">
              <input type="radio" name={`choix-${l.numero}`} value={c.id} defaultChecked={choix === c.id} className="mt-0.5 size-5 shrink-0" />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="font-semibold">C&apos;est {c.nomComplet} (fiche existante)</span>
                <span className="text-sm text-muted-foreground">
                  Sa fiche : {c.numeros.length > 0 ? c.numeros.map(formaterTelephone).join(", ") : "aucun numéro"} · {c.cellule ?? "aucune cellule"}
                  {c.membreDeLaCaisse && " · déjà membre de cette caisse"}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <PastilleComparaison champ="Numéro" resultat={c.comparaison.numero} />
                  <PastilleComparaison champ="Cellule" resultat={c.comparaison.cellule} />
                </span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-border has-checked:bg-secondary has-checked:ring-primary">
            <input type="radio" name={`choix-${l.numero}`} value="creer" defaultChecked={choix === "creer"} className="mt-0.5 size-5 shrink-0" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">C&apos;est une autre personne : la créer</span>
              <span className="text-sm text-muted-foreground">
                Ta liste : {l.telephone ? formaterTelephone(l.telephone) : "aucun numéro"} · {l.cellule ?? "aucune cellule"}
              </span>
            </span>
          </label>
        </fieldset>
      )}
    </li>
  );
}
