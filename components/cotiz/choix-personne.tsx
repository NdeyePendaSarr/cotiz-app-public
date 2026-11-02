"use client";

import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { formaterTelephone } from "@/lib/telephone";
import { normaliserNom } from "@/lib/texte";

export type PersonneChoisissable = { id: string; nomComplet: string; numeros?: string[]; aliasWave?: string[]; cellule?: string | null };

const MAX_RESULTATS = 8;

/** Filtre par nom, alias ou bout de numéro (3 chiffres au moins), sans casse ni accents. */
export function filtrerPersonnes<T extends PersonneChoisissable>(personnes: T[], recherche: string): T[] {
  const texte = normaliserNom(recherche);
  if (!texte) return [];
  const chiffres = recherche.replace(/\D/g, "");
  return personnes.filter(
    (p) =>
      [p.nomComplet, ...(p.aliasWave ?? [])].some((n) => normaliserNom(n).includes(texte)) ||
      (chiffres.length >= 3 && (p.numeros ?? []).some((n) => n.includes(chiffres))),
  );
}

/**
 * Choix d'une personne avec recherche (audit, lot 1) : remplace une liste déroulante de
 * dizaines de noms. On tape 2 ou 3 lettres ou un bout de numéro ; au plus 8 résultats.
 * Contrôlé si `valeur` est fourni, sinon garde son propre choix (départ : `valeurInitiale`).
 */
export function ChoixPersonne({
  personnes,
  valeur,
  valeurInitiale = null,
  onChoisir,
  name,
  libelle,
  aucunChoix,
}: {
  personnes: PersonneChoisissable[];
  valeur?: string | null;
  valeurInitiale?: string | null;
  onChoisir?: (id: string | null) => void;
  /** Nom du champ caché envoyé avec le formulaire (facultatif). */
  name?: string;
  /** Libellé accessible du champ de recherche. */
  libelle: string;
  /** Texte affiché quand personne n'est choisi (ex. « Inconnue : à rapprocher ce soir »). */
  aucunChoix?: string;
}) {
  const [interne, setInterne] = useState<string | null>(valeurInitiale);
  const choisi = valeur !== undefined ? valeur : interne;
  const [recherche, setRecherche] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const idListe = useId();
  const personne = choisi ? personnes.find((p) => p.id === choisi) : undefined;
  const resultats = filtrerPersonnes(personnes, recherche);

  function choisir(id: string | null) {
    setInterne(id);
    setRecherche("");
    onChoisir?.(id);
  }

  return (
    <div className="flex flex-col gap-2">
      {name && <input type="hidden" name={name} value={choisi ?? ""} />}
      {personne ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-secondary-foreground">{personne.nomComplet}</span>
            <Details personne={personne} />
          </span>
          <button
            type="button"
            onClick={() => {
              choisir(null);
              setTimeout(() => champ.current?.focus(), 0);
            }}
            className="flex h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary"
          >
            <X aria-hidden className="size-4" />
            Changer
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={champ}
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Tape un nom ou un numéro"
              aria-label={libelle}
              aria-controls={idListe}
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {aucunChoix && !recherche && <p className="text-sm text-muted-foreground">{aucunChoix}</p>}
          {recherche && (
            <ul id={idListe} className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">
              {resultats.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted-foreground">Aucune personne trouvée.</li>
              ) : (
                resultats.slice(0, MAX_RESULTATS).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => choisir(p.id)} className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left hover:bg-muted">
                      <span className="font-semibold">{p.nomComplet}</span>
                      <Details personne={p} />
                    </button>
                  </li>
                ))
              )}
              {resultats.length > MAX_RESULTATS && (
                <li className="px-3 py-2 text-xs text-muted-foreground">{resultats.length - MAX_RESULTATS} autres : précise la recherche.</li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Details({ personne: p }: { personne: PersonneChoisissable }) {
  const elements = [p.cellule, p.numeros?.[0] && formaterTelephone(p.numeros[0])].filter(Boolean);
  if (elements.length === 0) return null;
  return <span className="block text-xs text-muted-foreground">{elements.join(" · ")}</span>;
}
