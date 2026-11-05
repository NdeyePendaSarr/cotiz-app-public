"use client";

import { ArrowLeftRight, ClipboardPaste, House, PenLine, Plus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const ONGLETS = [
  { href: "/tableau-de-bord", libelle: "Accueil", Icone: House },
  { href: "/caisses", libelle: "Caisses", Icone: Wallet },
  { href: "/capture", libelle: "Paiement", Icone: Plus, principal: true },
  { href: "/rapprochement", libelle: "Rapprocher", Icone: ArrowLeftRight },
  { href: "/personnes", libelle: "Personnes", Icone: Users },
] as const;

// Les deux façons d'enregistrer un paiement (audit, lot 3) : « Coller » ne parlait pas d'une saisie manuelle.
export const CHOIX_PAIEMENT = [
  { href: "/capture", libelle: "Coller un SMS Wave", detail: "Montant, nom et référence lus tout seuls", Icone: ClipboardPaste },
  { href: "/capture/manuelle", libelle: "Saisie manuelle", detail: "Wave sans SMS, Orange Money ou cash", Icone: PenLine },
] as const;

const CADRE =
  "fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden";

/**
 * Barre d'onglets fixe en bas de l'écran, à portée de pouce. « Paiement », le bouton rond
 * central (l'action principale du cahier), propose : coller un SMS Wave ou saisir à la main.
 * pb-[env(safe-area-inset-bottom)] : espace pour la barre d'accueil de l'iPhone.
 */
export function BarreOnglets({ aRapprocher }: { aRapprocher: number }) {
  const chemin = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const actif = (href: string) => chemin === href || chemin.startsWith(`${href}/`);

  return (
    <>
      {menuOuvert && (
        // Voile : un appui en dehors du menu le ferme.
        <button type="button" aria-label="Fermer le menu Paiement" onClick={() => setMenuOuvert(false)} className="fixed inset-0 z-10 bg-foreground/20 lg:hidden" />
      )}
      <nav aria-label="Navigation principale" className={CADRE}>
        {menuOuvert && (
          <ul id="menu-paiement" className="absolute inset-x-4 bottom-[calc(100%+0.75rem)] mx-auto flex max-w-sm flex-col gap-1 rounded-2xl bg-card p-2 shadow-xl ring-1 ring-border">
            {CHOIX_PAIEMENT.map(({ href, libelle, detail, Icone }) => (
              <li key={href}>
                <Link href={href} onClick={() => setMenuOuvert(false)} className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Icone aria-hidden className="size-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{libelle}</span>
                    <span className="text-xs text-muted-foreground">{detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* Largeur selon le texte : à 13 px, « Rapprocher » ne tient pas dans cinq colonnes égales sur petit écran. */}
        <ul className="mx-auto flex max-w-md justify-between">
          {ONGLETS.map(({ href, libelle, Icone, ...o }) => {
            const estActif = actif(href);
            const classes = cn(
              "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[13px] leading-tight font-semibold",
              estActif ? "text-primary" : "text-muted-foreground",
            );
            if ("principal" in o) {
              return (
                <li key={href} className="flex-auto">
                  <button
                    type="button"
                    onClick={() => setMenuOuvert((ouvert) => !ouvert)}
                    aria-expanded={menuOuvert}
                    aria-controls="menu-paiement"
                    className={classes}
                  >
                    <span className="-mt-6 flex size-14 items-center justify-center rounded-full bg-or text-or-foreground shadow-lg ring-4 ring-card">
                      <Icone aria-hidden className={cn("size-7 transition-transform", menuOuvert && "rotate-45")} />
                    </span>
                    {libelle}
                  </button>
                </li>
              );
            }
            return (
              <li key={href} className="flex-auto">
                <Link href={href} aria-current={estActif ? "page" : undefined} className={classes}>
                  <Icone aria-hidden className="size-6" strokeWidth={estActif ? 2.4 : 1.8} />
                  {libelle}
                  {href === "/rapprochement" && aRapprocher > 0 && (
                    <span className="absolute top-1 left-1/2 ml-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[13px] leading-5 text-primary-foreground">
                      {aRapprocher}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** Même hauteur que la barre, le temps de lire la session (évite un saut de mise en page). */
export function SqueletteOnglets() {
  return <div aria-hidden className={cn(CADRE, "h-[calc(3.75rem+env(safe-area-inset-bottom))]")} />;
}
