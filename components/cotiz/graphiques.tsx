import { formaterFCFA } from "@/lib/format";
import { LIBELLES_ETAT_CASE, type EtatCase, type LigneHistorique } from "@/lib/suivi/historique";
import { cn } from "@/lib/utils";

// Graphiques maison (lot 3) : HTML et SVG rendus côté serveur, sans bibliothèque. Chaque marque
// porte un title (info-bulle au survol) et chaque graphique a une version texte pour les lecteurs
// d'écran. Les couleurs viennent de globals.css (--graph-*, statuts), jamais de la page.

export type Segment = { libelle: string; valeur: number; /** Classe de trait SVG, ex. stroke-paye. */ trait: string };

/**
 * Anneau : segments dans l'ordre donné, séparés d'un petit vide, sur une piste.
 * `children` s'affiche au centre (pourcentage, compte…).
 */
export function Anneau({
  segments,
  total,
  libelle,
  piste = "stroke-primary-foreground/15",
  taille = 132,
  epaisseur = 14,
  children,
  className,
}: {
  segments: Segment[];
  /** Total de l'anneau complet (par défaut, la somme des segments). */
  total?: number;
  /** Description pour les lecteurs d'écran. */
  libelle: string;
  piste?: string;
  taille?: number;
  epaisseur?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = 50 - epaisseur / 2;
  const tour = 2 * Math.PI * r;
  const somme = total ?? segments.reduce((s, x) => s + x.valeur, 0);
  const visibles = segments.filter((s) => s.valeur > 0);
  const vide = visibles.length > 1 ? 1.5 : 0; // 2 px environ entre deux segments
  let depart = 0;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: taille, height: taille }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={libelle} className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={epaisseur} className={piste} />
        {somme > 0 &&
          visibles.map((s) => {
            const longueur = (s.valeur / somme) * tour;
            const trait = (
              <circle
                key={s.libelle}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                strokeWidth={epaisseur}
                strokeDasharray={`${Math.max(0, longueur - vide)} ${tour}`}
                strokeDashoffset={-depart}
                className={s.trait}
              >
                <title>{`${s.libelle} : ${s.valeur}`}</title>
              </circle>
            );
            depart += longueur;
            return trait;
          })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

export type Barre = { cle: string; libelle: string; valeur: number; /** Mise en avant (aujourd'hui). */ accent?: boolean };

/** Barres verticales (un jour = une barre), de la plus ancienne à la plus récente. */
export function Barres({ barres, libelle, debut, fin }: { barres: Barre[]; libelle: string; debut: string; fin: string }) {
  const max = Math.max(1, ...barres.map((b) => b.valeur));
  return (
    <figure className="flex flex-col gap-1.5">
      <div aria-hidden className="flex h-28 items-end gap-1 border-b border-input lg:h-36">
        {barres.map((b) => (
          <div key={b.cle} title={`${b.libelle} : ${formaterFCFA(b.valeur)}`} className="group flex h-full flex-1 items-end">
            <div
              className={cn("w-full rounded-t-[4px] transition-opacity group-hover:opacity-80", b.accent ? "bg-or" : "bg-primary", b.valeur === 0 && "bg-transparent")}
              style={{ height: `${b.valeur === 0 ? 0 : Math.max(3, (b.valeur / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{debut}</span>
        <span className="font-medium text-foreground">{fin}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{libelle}</caption>
        <tbody>
          {barres.map((b) => (
            <tr key={b.cle}>
              <th scope="row">{b.libelle}</th>
              <td>{formaterFCFA(b.valeur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type Part = { libelle: string; valeur: number; /** Classe de fond, ex. bg-graph-wave. */ fond: string };

/** Barre de répartition horizontale (parts d'un tout), avec sa légende chiffrée. */
export function Repartition({ parts, libelle }: { parts: Part[]; libelle: string }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <figure className="flex flex-col gap-2">
      <div role="img" aria-label={`${libelle} : ${parts.map((p) => `${p.libelle} ${pct(p.valeur)} %`).join(", ")}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
        {parts
          .filter((p) => p.valeur > 0)
          .map((p) => (
            <div key={p.libelle} title={`${p.libelle} : ${formaterFCFA(p.valeur)}`} className={p.fond} style={{ width: `${(p.valeur / total) * 100}%` }} />
          ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => (
          <span key={p.libelle} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-[3px]", p.fond)} />
            {p.libelle}
            <span className="font-semibold">{pct(p.valeur)} %</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Barres horizontales classées (ex. bonnes volontés par donateur), valeurs écrites à droite. */
export function BarresHorizontales({ lignes, libelle, fond = "bg-graph-om" }: { lignes: { libelle: string; valeur: number }[]; libelle: string; fond?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  return (
    <figure aria-label={libelle} className="flex flex-col gap-2.5">
      {lignes.map((l) => (
        <div key={l.libelle} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{l.libelle}</span>
            <span className="shrink-0 font-semibold">{formaterFCFA(l.valeur)}</span>
          </div>
          <div aria-hidden className="h-1.5 rounded-full bg-muted">
            <div className={cn("h-full rounded-full", fond)} style={{ width: `${(l.valeur / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </figure>
  );
}

export type Etape ={ libelle: string; valeur: number; genre: "entree" | "don" | "sortie" | "total" };

const FOND_ETAPE: Record<Etape["genre"], string> = {
  entree: "bg-graph-wave",
  don: "bg-graph-om",
  sortie: "bg-graph-sortie",
  total: "bg-foreground",
};

/**
 * Cascade : chaque étape part de là où la précédente s'est arrêtée (entrées vers le haut,
 * sorties vers le bas) ; l'étape « total » repart de zéro. Montants en valeur absolue.
 */
export function Cascade({ etapes, libelle }: { etapes: Etape[]; libelle: string }) {
  // Niveau atteint après chaque étape (somme cumulée), calculé sans variable réassignée pendant le rendu.
  const niveaux = etapes.map((_, i) =>
    etapes.slice(0, i + 1).reduce((n, e) => (e.genre === "total" ? n : n + (e.genre === "sortie" ? -e.valeur : e.valeur)), 0),
  );
  const barres = etapes.map((e, i) => {
    if (e.genre === "total") return { ...e, bas: 0, haut: e.valeur };
    const avant = i === 0 ? 0 : niveaux[i - 1];
    return { ...e, bas: Math.min(avant, niveaux[i]), haut: Math.max(avant, niveaux[i]) };
  });
  const max = Math.max(1, ...barres.map((b) => b.haut));
  const pct = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  // « 230k » ; un restant négatif (dépassement) garde son signe.
  const court = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v) >= 1000 ? `${Math.round(Math.abs(v) / 1000)}k` : Math.abs(v)}`;
  return (
    <figure className="flex flex-col gap-1.5">
      <div aria-hidden className="flex h-36 items-stretch gap-1.5 border-b border-input pt-5">
        {barres.map((b) => (
          <div key={b.libelle} className="relative flex-1" title={`${b.libelle} : ${formaterFCFA(b.valeur)}`}>
            <div className={cn("absolute inset-x-0 mx-auto max-w-16 rounded-[4px]", FOND_ETAPE[b.genre])} style={{ bottom: pct(b.bas), height: `max(3px, calc(${pct(b.haut)} - ${pct(b.bas)}))` }} />
            <span className="absolute inset-x-0 text-center text-xs font-semibold whitespace-nowrap" style={{ bottom: `calc(${pct(b.haut)} + 2px)` }}>
              {b.genre === "sortie" ? "−" : b.genre === "don" ? "+" : ""}
              {court(b.valeur)}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="flex gap-1.5 text-center text-xs text-muted-foreground">
        {barres.map((b) => (
          <span key={b.libelle} className={cn("min-w-0 flex-1 truncate", b.genre === "total" && "font-semibold text-foreground")}>
            {b.libelle}
          </span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>{libelle}</caption>
        <tbody>
          {etapes.map((e) => (
            <tr key={e.libelle}>
              <th scope="row">{e.libelle}</th>
              <td>
                {e.genre === "sortie" ? "moins " : e.genre === "don" ? "plus " : ""}
                {formaterFCFA(e.valeur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// Grille de l'historique (lot 4) : la couleur ET un signe (✓ ½ ×) distinguent les états,
// pour rester lisibles au soleil et pour les daltoniennes.
const CASE: Record<EtatCase, { fond: string; signe: string }> = {
  PAYE: { fond: "bg-paye text-card", signe: "✓" },
  PARTIEL: { fond: "bg-partiel text-card", signe: "½" },
  NON_PAYE: { fond: "bg-retard text-card", signe: "×" },
  EN_ATTENTE: { fond: "border-2 border-dashed border-input", signe: "" },
  ABSENT: { fond: "", signe: "" },
};

/** Tableau lignes × cycles (membres d'une caisse, ou caisses d'une personne), avec sa légende. */
export function GrilleHistorique({
  cycles,
  lignes,
  entete,
  avecTotal = true,
  legende = true,
}: {
  cycles: number[];
  lignes: LigneHistorique[];
  /** Titre de la première colonne (« Membre », « Caisse »). */
  entete: string;
  avecTotal?: boolean;
  /** Légende sous la grille (à ne montrer qu'une fois quand plusieurs grilles se suivent). */
  legende?: boolean;
}) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="sticky left-0 z-[1] bg-card pr-2 text-left font-medium">
                {entete}
              </th>
              {cycles.map((n) => (
                <th key={n} scope="col" className="w-8 text-center font-medium">
                  <span className="sr-only">Cycle </span>
                  {n}
                </th>
              ))}
              {avecTotal && (
                <th scope="col" className="pl-2 text-right font-medium whitespace-nowrap">
                  Payés
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.ligneId} className={cn(!l.actif && "opacity-60")}>
                <th scope="row" className="sticky left-0 z-[1] max-w-36 truncate bg-card pr-2 text-left font-medium">
                  {l.libelle}
                </th>
                {l.cases.map((etat, i) => (
                  <td key={cycles[i]} title={`Cycle ${cycles[i]} : ${LIBELLES_ETAT_CASE[etat]}`}>
                    <span className={cn("flex size-8 items-center justify-center rounded-md text-xs font-bold", CASE[etat].fond)}>
                      <span aria-hidden>{CASE[etat].signe}</span>
                      <span className="sr-only">{LIBELLES_ETAT_CASE[etat]}</span>
                    </span>
                  </td>
                ))}
                {avecTotal && (
                  <td className="pl-2 text-right whitespace-nowrap text-muted-foreground">
                    {l.echeances > 0 ? `${l.payes}/${l.echeances}` : "–"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legende && <figcaption className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(["PAYE", "PARTIEL", "NON_PAYE", "EN_ATTENTE"] as const).map((etat) => (
          <span key={etat} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-[4px] text-[10px] font-bold", CASE[etat].fond)}>
              {CASE[etat].signe}
            </span>
            {LIBELLES_ETAT_CASE[etat]}
          </span>
        ))}
      </figcaption>}
    </figure>
  );
}
