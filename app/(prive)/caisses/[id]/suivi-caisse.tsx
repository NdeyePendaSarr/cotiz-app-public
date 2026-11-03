"use client";

import { Check, ChevronDown, ChevronsUpDown, ChevronUp, MessageCircle, Search } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { cloturerCycle } from "@/app/actions/cycles";
import { Pastille, PastilleStatut } from "@/components/cotiz/pastille";
import { Bloc, Section } from "@/components/cotiz/section";
import { BOUTON_WHATSAPP, CLASSE_LISTE, CLASSE_ZONE_TEXTE } from "@/components/cotiz/styles";
import { Button } from "@/components/ui/button";
import { lignesRecapFinances } from "@/lib/depenses";
import { formaterDate, formaterFCFA } from "@/lib/format";
import { construireMessage, fileDeRelance, lienWhatsApp } from "@/lib/relance";
import {
  cellulesDu,
  construireRecap,
  CRITERES_TRI,
  SANS_CELLULE,
  totauxParCellule,
  trierSuivi,
  type CritereTri,
  type FormatRecap,
  type LigneSuivi,
  type Suivi,
} from "@/lib/suivi/cycle";
import { formaterTelephone } from "@/lib/telephone";
import { normaliserNom } from "@/lib/texte";
import { cn } from "@/lib/utils";
import { useRelancesDuJour } from "./relances-du-jour";

// Format du récap WhatsApp choisi par la trésorière : détaillé (cahier, phase 8).
const FORMAT_RECAP: FormatRecap = "detaille";

// Tri, recherche et filtre : style partagé des listes, en plus compact.
const CLASSE_SELECT = cn(CLASSE_LISTE, "w-auto text-sm font-semibold");

// Onglets de filtre de la liste (affichage seulement, comme les onglets de la maquette).
const FILTRES = { tous: "Tous", pasAJour: "Pas à jour", payes: "Payés" } as const;
type Filtre = keyof typeof FILTRES;
const garder: Record<Filtre, (l: LigneSuivi) => boolean> = {
  tous: () => true,
  pasAJour: (l) => !l.aJour,
  payes: (l) => l.aJour,
};

export type ContexteSuivi = {
  caisseId: string;
  caisseNom: string;
  type: "TONTINE" | "COLLECTE" | "MENSUALITE";
  cycleNumero: number;
  cycleOuvert: boolean;
  dateDebut: string; // ISO
  dateEcheance: string; // ISO
  modeleRelance: string | null;
  /** Échéance du cycle suivant (tontine), pour la confirmation de clôture. */
  prochaineEcheance: string | null;
  dateLimitePassee: boolean;
  /** Collecte (phase 11) : encaissé, dépensé et restant, ajoutés au récap. */
  finances?: { cotisations: number; dons: number; encaisse: number; depense: number; restant: number } | null;
};

/**
 * Suivi du cycle (les totaux sont dans l'en-tête de la page) : liste des membres, récap, clôture.
 * Sur ordinateur (lg) : tableau des membres à gauche (recherche, tri par colonne) et panneau
 * collant à droite (récap, par cellule, relance en série). Sur téléphone, tout reste en une colonne.
 */
export function SuiviCaisse({ suivi, contexte }: { suivi: Suivi; contexte: ContexteSuivi }) {
  const [tri, setTri] = useState<CritereTri>("ordre");
  // Second clic sur la même colonne du tableau : ordre inversé.
  const [inverse, setInverse] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  // Filtre par cellule (phase 10) : "" = toutes les cellules.
  const [cellule, setCellule] = useState("");
  // Recherche par nom (tableau, version ordinateur).
  const [recherche, setRecherche] = useState("");
  const parCellule = useMemo(() => totauxParCellule(suivi), [suivi]);
  const cellules = parCellule.length > 0 ? cellulesDu(suivi.actifs) : [];
  const actifs = useMemo(() => {
    const texte = normaliserNom(recherche);
    const lignes = trierSuivi(suivi.actifs, tri).filter(
      (l) => (!cellule || (l.cellule || SANS_CELLULE) === cellule) && (!texte || normaliserNom(l.nom).includes(texte)),
    );
    return inverse ? lignes.reverse() : lignes;
  }, [suivi.actifs, tri, inverse, cellule, recherche]);
  const visibles = actifs.filter(garder[filtre]);
  const dateEcheance = new Date(contexte.dateEcheance);
  const { relances, marquer } = useRelancesDuJour(contexte.caisseId);
  // État de la relance en série, partagé par ses deux emplacements (liste sur téléphone, panneau sur ordinateur).
  const serie = useSerie();
  const trier = (critere: CritereTri) => {
    setInverse(critere === tri ? !inverse : false);
    setTri(critere);
  };
  const relanceEnSerie = contexte.cycleOuvert && <RelanceEnSerie lignes={actifs} contexte={contexte} relances={relances} marquer={marquer} serie={serie} />;

  return (
    <>
      {contexte.cycleOuvert && contexte.dateLimitePassee && (
        <p role="status" className="rounded-2xl bg-avertissement/12 p-3 text-sm font-medium text-avertissement">
          {contexte.type === "MENSUALITE" ? "Dernier mois terminé : clôturer la mensualité ?" : "Date limite passée : clôturer la collecte ?"}
        </p>
      )}
      {suivi.totalArrieres > 0 && (
        <p className="rounded-2xl bg-avertissement/12 p-3 text-sm font-medium text-avertissement">
          Arriérés des cycles précédents : {formaterFCFA(suivi.totalArrieres)} (hors totaux du cycle)
        </p>
      )}

      <div data-pleine-largeur className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6">
        {/* Panneau : en premier sur téléphone (comme avant), à droite et collant sur ordinateur. */}
        <aside aria-label="Récap et relances" className="flex flex-col gap-5 lg:sticky lg:top-16 lg:col-start-2 lg:row-start-1">
          {/* key = n° du cycle : après une clôture, le récap repart de zéro. */}
          <CopierRecap
            key={`recap-${contexte.cycleNumero}`}
            texte={[construireRecap(suivi, { caisse: contexte.caisseNom, cycle: contexte.cycleNumero, dateEcheance, mensualite: contexte.type === "MENSUALITE" }, FORMAT_RECAP), ...(contexte.finances ? ["", ...lignesRecapFinances(contexte.finances)] : [])].join("\n")}
          />

          {relanceEnSerie && <div className="hidden lg:block">{relanceEnSerie}</div>}

          {parCellule.length > 0 && (
            <Section titre="Par cellule">
              <Bloc>
                {parCellule.map((c) => (
                  <button
                    key={c.cellule}
                    type="button"
                    onClick={() => setCellule((actuelle) => (actuelle === c.cellule ? "" : c.cellule))}
                    aria-pressed={cellule === c.cellule}
                    className={cn("flex min-h-14 w-full flex-col gap-1.5 py-3 text-left", cellule === c.cellule && "text-primary")}
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">{c.cellule}</span>
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        {c.payes}/{c.membres} à jour
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{formaterFCFA(c.recu)}</span> reçus sur {formaterFCFA(c.attendu)}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${c.attendu > 0 ? Math.round((c.recu / c.attendu) * 100) : 0}%` }} />
                    </span>
                  </button>
                ))}
              </Bloc>
            </Section>
          )}
        </aside>

        <Section
          className="lg:col-start-1 lg:row-start-1"
          titre={
            contexte.type === "MENSUALITE"
              ? `Mensualité ${contexte.cycleOuvert ? "en cours" : "clôturée"}`
              : `Cycle n° ${contexte.cycleNumero} ${contexte.cycleOuvert ? "en cours" : "clôturé"}`
          }
          action={
            <select
              aria-label="Trier la liste"
              value={tri}
              onChange={(e) => {
                setTri(e.target.value as CritereTri);
                setInverse(false);
              }}
              className={cn(CLASSE_SELECT, "lg:hidden")}
            >
              {(Object.keys(CRITERES_TRI) as CritereTri[]).map((c) => (
                <option key={c} value={c}>
                  {CRITERES_TRI[c]}
                </option>
              ))}
            </select>
          }
        >
          <p className="-mt-1 text-xs text-muted-foreground">
            du {formaterDate(new Date(contexte.dateDebut))} au {formaterDate(dateEcheance)}
          </p>
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative hidden flex-1 lg:block">
              <span className="sr-only">Chercher un membre</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un membre…"
                className={cn(CLASSE_SELECT, "w-full pl-9 font-normal")}
              />
            </label>
            {cellules.length > 0 && (
              <select aria-label="Filtrer par cellule" value={cellule} onChange={(e) => setCellule(e.target.value)} className={cn(CLASSE_SELECT, "w-full lg:w-56")}>
                <option value="">Toutes les cellules</option>
                {cellules.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div role="tablist" aria-label="Filtrer les membres" className="flex gap-5 overflow-x-auto border-b border-border lg:overflow-visible">
            {(Object.keys(FILTRES) as Filtre[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filtre === f}
                onClick={() => setFiltre(f)}
                className={cn(
                  "-mb-px h-11 shrink-0 border-b-2 text-sm font-semibold whitespace-nowrap",
                  filtre === f ? "border-foreground text-foreground" : "border-transparent text-primary",
                )}
              >
                {FILTRES[f]} <span className="font-semibold opacity-70">{actifs.filter(garder[f]).length}</span>
              </button>
            ))}
          </div>

          {/* Suit le tri et le filtre de cellule choisis : on peut relancer une seule cellule. */}
          {relanceEnSerie && <div className="lg:hidden">{relanceEnSerie}</div>}

          {visibles.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {suivi.actifs.length === 0 ? "Aucune échéance dans ce cycle." : "Personne dans cette liste."}
            </p>
          ) : (
            <>
              <TableauMembres
                lignes={visibles}
                tri={tri}
                inverse={inverse}
                onTrier={trier}
                avecCellule={parCellule.length > 0}
                contexte={contexte}
                relances={relances}
                marquer={marquer}
              />
              <Bloc className="lg:hidden">
                {visibles.map((l) => (
                  <LigneMembre
                    key={l.membreId}
                    ligne={l}
                    contexte={contexte}
                    relance={contexte.cycleOuvert}
                    relanceAujourdhui={relances.has(l.membreId)}
                    onRelance={() => marquer(l.membreId)}
                  />
                ))}
              </Bloc>
            </>
          )}

          {suivi.retires.length > 0 && (
            <details>
              <summary className="flex h-11 cursor-pointer items-center text-sm font-semibold text-muted-foreground">Membres retirés ({suivi.retires.length})</summary>
              <Bloc className="opacity-80">
                {suivi.retires.map((l) => (
                  <LigneMembre key={l.membreId} ligne={l} contexte={contexte} relance={false} />
                ))}
              </Bloc>
            </details>
          )}
        </Section>
      </div>
    </>
  );
}

const COLONNES: { critere: CritereTri; libelle: string; nombre?: boolean }[] = [
  { critere: "ordre", libelle: "N°" },
  { critere: "nom", libelle: "Nom" },
  { critere: "cellule", libelle: "Cellule" },
  { critere: "verse", libelle: "Versé", nombre: true },
  { critere: "reste", libelle: "Reste", nombre: true },
  { critere: "statut", libelle: "Statut" },
];

/** Tableau des membres (ordinateur) : un clic sur un en-tête trie, un second inverse l'ordre. */
function TableauMembres({
  lignes,
  tri,
  inverse,
  onTrier,
  avecCellule,
  contexte,
  relances,
  marquer,
}: {
  lignes: LigneSuivi[];
  tri: CritereTri;
  inverse: boolean;
  onTrier: (critere: CritereTri) => void;
  avecCellule: boolean;
  contexte: ContexteSuivi;
  relances: ReadonlySet<string>;
  marquer: (membreId: string) => void;
}) {
  // N° = ordre de passage : utile dans une tontine, toujours vide dans une collecte (la colonne y est
  // retirée pour laisser la place aux boutons de relance, demande de la trésorière).
  const avecOrdre = contexte.type === "TONTINE";
  const colonnes = COLONNES.filter((c) => (avecCellule || c.critere !== "cellule") && (avecOrdre || c.critere !== "ordre"));
  return (
    <div className="hidden overflow-x-auto rounded-2xl bg-card ring-1 ring-border lg:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            {colonnes.map((c) => (
              <th
                key={c.critere}
                scope="col"
                aria-sort={tri === c.critere ? (inverse ? "descending" : "ascending") : undefined}
                className={cn("px-2 font-semibold", c.nombre && "text-right")}
              >
                <button
                  type="button"
                  onClick={() => onTrier(c.critere)}
                  className={cn("inline-flex h-11 items-center gap-1 hover:text-foreground", c.nombre && "flex-row-reverse", tri === c.critere && "text-primary")}
                >
                  {c.libelle}
                  {tri === c.critere ? (
                    inverse ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />
                  ) : (
                    <ChevronsUpDown aria-hidden className="size-3.5 opacity-40" />
                  )}
                </button>
              </th>
            ))}
            {contexte.cycleOuvert && (
              <th scope="col" className="px-2">
                <span className="sr-only">Relance</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lignes.map((l) => (
            <tr key={l.membreId} className="h-14 transition-colors hover:bg-secondary/50">
              {avecOrdre && <td className="w-12 px-2 py-2 font-bold text-muted-foreground tabular-nums">{l.ordre ?? "–"}</td>}
              <td className="min-w-32 px-2 py-2">
                <span className="font-semibold">{l.nom}</span>
                {(l.enRetard || l.arriere > 0) && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {l.enRetard && <Pastille ton="retard" className="px-2 py-0.5">en retard</Pastille>}
                    {l.arriere > 0 && (
                      <Pastille ton="avertissement" className="py-0.5">arriéré : {formaterFCFA(l.arriere)}</Pastille>
                    )}
                  </span>
                )}
              </td>
              {avecCellule && <td className="px-2 py-2 font-medium text-primary">{l.cellule ?? <span className="text-muted-foreground">–</span>}</td>}
              <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{formaterFCFA(l.paye)}</td>
              <td className={cn("px-2 py-2 text-right font-bold whitespace-nowrap tabular-nums", l.reste === 0 ? "text-muted-foreground" : l.paye > 0 ? "text-partiel" : "text-retard")}>
                {l.reste > 0 ? formaterFCFA(l.reste) : "–"}
              </td>
              <td className="px-2 py-2">
                <PastilleStatut statut={l.statut} />
              </td>
              {contexte.cycleOuvert && (
                <td className="px-2 py-1.5 text-right">
                  {!l.aJour &&
                    (relances.has(l.membreId) ? (
                      <span title="Relancé aujourd'hui" className="flex h-11 items-center justify-end gap-1 text-xs font-semibold whitespace-nowrap text-paye">
                        <Check aria-hidden className="size-3.5" />
                        Relancé
                      </span>
                    ) : (
                      <Relancer ligne={l} contexte={contexte} onRelance={() => marquer(l.membreId)} court />
                    ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Serie = ReturnType<typeof useSerie>;

/** État d'une relance en série : en cours ou non, et les personnes « passées » pendant celle-ci. */
function useSerie() {
  const [active, setActive] = useState(false);
  const [passes, setPasses] = useState<ReadonlySet<string>>(new Set());
  return {
    active,
    passes,
    demarrer: () => setActive(true),
    passer: (membreId: string) => setPasses((p) => new Set([...p, membreId])),
    // Arrêter ou fermer : les personnes « passées » redeviennent à relancer.
    arreter: () => {
      setActive(false);
      setPasses(new Set());
    },
  };
}

function LigneMembre({
  ligne: l,
  contexte,
  relance,
  relanceAujourdhui = false,
  onRelance,
}: {
  ligne: LigneSuivi;
  contexte: ContexteSuivi;
  relance: boolean;
  relanceAujourdhui?: boolean;
  onRelance?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
            l.ordre !== null ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
          )}
          aria-label={l.ordre !== null ? `Ordre ${l.ordre}` : undefined}
        >
          {l.ordre ?? "–"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{l.nom}</span>
          {l.cellule && <span className="text-xs font-semibold text-primary">{l.cellule}</span>}
          {/* Le reste dû passe en premier (audit, lot 2) : c'est ce qu'on cherche des yeux. */}
          {l.reste > 0 ? (
            <span className={cn("text-sm font-bold", l.paye > 0 ? "text-partiel" : "text-retard")}>
              Reste {formaterFCFA(l.reste)}
              {l.exigible !== undefined && " à ce jour"}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formaterFCFA(l.paye)} versés sur {formaterFCFA(l.montantDu)}
          </span>
        </span>
        <PastilleStatut statut={l.statut} />
      </div>
      {(l.enRetard || l.arriere > 0) && (
        <span className="flex flex-wrap gap-1 pl-12">
          {l.enRetard && <Pastille ton="retard" className="px-2 py-0.5">en retard</Pastille>}
          {l.arriere > 0 && <Pastille ton="avertissement" className="py-0.5">arriéré : {formaterFCFA(l.arriere)}</Pastille>}
        </span>
      )}
      {relance && !l.aJour && (
        <div className="flex flex-col gap-1 pl-12">
          {relanceAujourdhui && (
            <span className="flex items-center gap-1 text-xs font-semibold text-paye">
              <Check aria-hidden className="size-3.5" />
              Relancé aujourd&apos;hui
            </span>
          )}
          <Relancer ligne={l} contexte={contexte} onRelance={onRelance} />
        </div>
      )}
    </div>
  );
}


/** Message de relance d'un membre (modèle de la caisse, ou message par défaut selon le type). */
function messageRelance(l: LigneSuivi, contexte: ContexteSuivi) {
  return construireMessage(contexte.modeleRelance, {
    nom: l.nom,
    caisse: contexte.caisseNom,
    cycle: contexte.cycleNumero,
    // Mensualité : ce qui est dû à ce jour, pas toute l'année.
    montant: l.exigible ?? l.montantDu,
    reste: l.reste,
    echeance: new Date(contexte.dateEcheance),
    type: contexte.type,
  });
}

/**
 * Relance en série : WhatsApp ne permet pas d'envoyer plusieurs messages d'un coup depuis un lien.
 * Un bouton ouvre la conversation de la personne suivante ; au retour dans Cotiz, la suivante est prête.
 * Ceux déjà relancés aujourd'hui (sur ce téléphone) sont sautés.
 */
function RelanceEnSerie({
  lignes,
  contexte,
  relances,
  marquer,
  serie,
}: {
  lignes: LigneSuivi[];
  contexte: ContexteSuivi;
  relances: ReadonlySet<string>;
  marquer: (membreId: string) => void;
  serie: Serie;
}) {
  const { active, passes, arreter } = serie;
  // « Passer » : sauté pour cette série seulement, pas compté comme relancé.
  const file = fileDeRelance(lignes, new Set([...relances, ...passes]));
  const sansPasses = fileDeRelance(lignes, relances);
  const dejaFaits = sansPasses.total - sansPasses.restants.length;
  if (file.total === 0 && file.sansNumero === 0) return null;

  if (!active) {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" onClick={serie.demarrer}disabled={file.restants.length === 0} className="text-base">
          <MessageCircle aria-hidden />
          {file.restants.length > 0 ? `Relancer tout le monde (${file.restants.length})` : "Tout le monde a été relancé aujourd'hui"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {dejaFaits > 0 && `${dejaFaits} déjà relancé(s) aujourd'hui sur ce téléphone. `}
          {file.sansNumero > 0 && `${file.sansNumero} sans numéro (à relancer autrement).`}
        </p>
      </div>
    );
  }

  const suivant = file.restants[0];
  const position = file.total - file.restants.length + 1;
  const href = suivant ? lienWhatsApp(suivant.numeros.find((n) => /^\d{9}$/.test(n)) ?? "", messageRelance(suivant, contexte)) : null;

  return (
    <section aria-label="Relance en série" className="flex flex-col gap-3 rounded-2xl bg-secondary p-4">
      {suivant && href ? (
        <>
          <p className="font-heading text-base font-semibold">
            Relance {position} sur {file.total}
          </p>
          <p>
            <span className="font-semibold">{suivant.nom}</span>
            {suivant.cellule && <span className="text-sm text-muted-foreground"> · {suivant.cellule}</span>}
            <span className="block text-sm text-muted-foreground">Reste {formaterFCFA(suivant.reste)}</span>
          </p>
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => marquer(suivant.membreId)} className={cn(BOUTON_WHATSAPP, "bg-card text-base")}>
            <MessageCircle aria-hidden className="size-4" />
            Ouvrir WhatsApp
          </a>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => serie.passer(suivant.membreId)} className="text-base">
              Passer
            </Button>
            <Button type="button" variant="ghost" onClick={arreter} className="text-base">
              Arrêter
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">Relance terminée ✓</p>
          <p className="text-sm text-muted-foreground">Tous les membres de la liste ont été relancés ou passés.</p>
          <Button type="button" variant="outline" onClick={arreter} className="text-base">
            Fermer
          </Button>
        </>
      )}
    </section>
  );
}

/** Lien wa.me avec message pré-rempli. Plusieurs numéros : un lien par numéro. `court` : libellé du tableau. */
function Relancer({ ligne: l, contexte, onRelance, court = false }: { ligne: LigneSuivi; contexte: ContexteSuivi; onRelance?: () => void; court?: boolean }) {
  const message = messageRelance(l, contexte);
  const liens = l.numeros.map((n) => ({ numero: n, href: lienWhatsApp(n, message) })).filter((x) => x.href);
  const libelle = court ? "Relancer" : "Relancer sur WhatsApp";
  // Tableau (court) : icône seule en dessous de 1 440 px, pour que la ligne tienne sans défilement.
  const texte = court ? <span className="hidden min-[1440px]:inline">{libelle}</span> : libelle;
  const accessible = court ? { "aria-label": `Relancer ${l.nom} sur WhatsApp`, title: `Relancer ${l.nom} sur WhatsApp` } : {};
  const bouton = court ? cn(BOUTON_WHATSAPP, "min-w-11") : BOUTON_WHATSAPP;

  if (liens.length === 0) {
    return (
      <Button type="button" variant="outline" disabled className="w-full text-sm">
        {court ? "Pas de numéro" : "Relancer (pas de numéro)"}
      </Button>
    );
  }
  if (liens.length === 1) {
    return (
      <a href={liens[0].href!} target="_blank" rel="noopener noreferrer" onClick={onRelance} className={bouton} {...accessible}>
        <MessageCircle aria-hidden className="size-4" />
        {texte}
      </a>
    );
  }
  return (
    <details>
      <summary className={cn(bouton, "cursor-pointer")} {...accessible}>
        <MessageCircle aria-hidden className="size-4" />
        {court ? <span className="hidden min-[1440px]:inline">{libelle}…</span> : `${libelle}…`}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {liens.map((x) => (
          <a key={x.numero} href={x.href!} target="_blank" rel="noopener noreferrer" onClick={onRelance} className={BOUTON_WHATSAPP}>
            {formaterTelephone(x.numero)}
          </a>
        ))}
      </div>
    </details>
  );
}

/** « Copier le récap » : presse-papiers si possible, sinon le texte s'affiche pour une copie manuelle. */
function CopierRecap({ texte }: { texte: string }) {
  const [etat, setEtat] = useState<"repos" | "copie" | "manuel">("repos");

  async function copier() {
    try {
      if (!window.isSecureContext || !navigator.clipboard?.writeText) throw new Error("indisponible");
      await navigator.clipboard.writeText(texte);
      setEtat("copie");
    } catch {
      setEtat("manuel"); // HTTP en local sur iPhone, ou accès refusé
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={copier} className="text-base">
        {etat === "copie" ? "Récap copié ✓" : "Copier le récap"}
      </Button>
      {etat === "manuel" && (
        <textarea
          readOnly
          value={texte}
          rows={8}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Récap à copier"
          className={cn(CLASSE_ZONE_TEXTE, "text-sm")}
        />
      )}
    </div>
  );
}

/** Clôture en deux temps : bilan des impayés, puis confirmation explicite (irréversible). Onglet Caisse. */
export function Cloture({ suivi, contexte }: { suivi: Suivi; contexte: ContexteSuivi }) {
  const [etat, envoyer, enCours] = useActionState(cloturerCycle.bind(null, contexte.caisseId), undefined);
  const [confirmation, setConfirmation] = useState(false);
  const impayes = [...suivi.actifs, ...suivi.retires].filter((l) => !l.aJour);

  if (!confirmation) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirmation(true)} className="text-base">
        {contexte.type === "COLLECTE" ? "Clôturer la collecte" : contexte.type === "MENSUALITE" ? "Clôturer la mensualité" : "Clôturer le cycle"}
      </Button>
    );
  }
  return (
    <form action={envoyer} role="alertdialog" aria-label="Confirmer la clôture" className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-semibold">{contexte.type === "COLLECTE" ? "Clôturer la collecte ?" : contexte.type === "MENSUALITE" ? "Clôturer la mensualité ?" : `Clôturer le cycle n° ${contexte.cycleNumero} ?`}</p>
      {impayes.length > 0 ? (
        <p className="text-sm">
          {impayes.length} membre{impayes.length > 1 ? "s ne sont" : " n'est"} pas à jour ({formaterFCFA(suivi.totaux.reste)} restant).
          {contexte.type === "TONTINE" && " Ces montants resteront dus comme arriérés."}
        </p>
      ) : (
        <p className="text-sm">Tout le monde est à jour.</p>
      )}
      {contexte.type === "TONTINE" && contexte.prochaineEcheance && (
        <p className="text-sm">Le cycle n° {contexte.cycleNumero + 1} s&apos;ouvrira, échéance le {formaterDate(new Date(contexte.prochaineEcheance))}.</p>
      )}
      <p className="text-sm font-semibold text-destructive">Cette action ne peut pas être annulée.</p>
      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setConfirmation(false)} className="text-base">
          Annuler
        </Button>
        <Button type="submit" variant="destructive" disabled={enCours} className="text-base">
          {enCours ? "Clôture…" : "Clôturer"}
        </Button>
      </div>
    </form>
  );
}
