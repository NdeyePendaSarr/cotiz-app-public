"use client";

import { ArrowLeftRight, HandCoins, House, LogOut, MessageSquareWarning, Plus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { seDeconnecter } from "@/app/actions/auth";
import { Logo } from "@/components/cotiz/logo";
import { BasculeTheme } from "@/components/cotiz/theme";
import { cn } from "@/lib/utils";
import { CHOIX_PAIEMENT } from "./barre-onglets";

const RUBRIQUES = [
  { href: "/tableau-de-bord", libelle: "Accueil", Icone: House },
  { href: "/caisses", libelle: "Caisses", Icone: Wallet },
  { href: "/rapprochement", libelle: "Rapprocher", Icone: ArrowLeftRight, compteur: "aRapprocher" },
  { href: "/personnes", libelle: "Personnes", Icone: Users },
  { href: "/sms-non-lus", libelle: "SMS non lus", Icone: MessageSquareWarning, compteur: "smsNonLus" },
  { href: "/a-rembourser", libelle: "À rembourser", Icone: HandCoins, compteur: "aRembourser" },
] as const;

export type Compteurs = { aRapprocher: number; smsNonLus: number; aRembourser: number };

const CADRE = "fixed inset-y-0 left-0 z-10 hidden w-64 flex-col bg-nuit px-4 py-6 text-primary-foreground lg:flex";

/**
 * Barre latérale (version ordinateur, à partir de 1 024 px) : remplace la barre d'onglets du bas.
 * Toutes les rubriques y tiennent, y compris « SMS non lus » et « À rembourser », avec leurs compteurs.
 * « Paiement » déplie les deux façons d'enregistrer un paiement, sans voile : la place ne manque pas.
 */
export function BarreLaterale({ compteurs, nom, initiales }: { compteurs: Compteurs; nom: string; initiales: string }) {
  const chemin = usePathname();
  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const actif = (href: string) => chemin === href || chemin.startsWith(`${href}/`);

  return (
    <aside aria-label="Navigation principale" className={CADRE}>
      <Link href="/tableau-de-bord" aria-label="Cotiz, accueil" className="flex h-11 items-center px-3">
        <Logo className="text-2xl" />
      </Link>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setPaiementOuvert((ouvert) => !ouvert)}
          aria-expanded={paiementOuvert}
          aria-controls="choix-paiement-lateral"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-or text-base font-semibold text-or-foreground shadow-lg transition-transform hover:scale-[1.02]"
        >
          <Plus aria-hidden className={cn("size-5 transition-transform", paiementOuvert && "rotate-45")} />
          Paiement
        </button>
        {paiementOuvert && (
          <ul id="choix-paiement-lateral" className="mt-2 flex flex-col gap-1 rounded-xl bg-primary-foreground/10 p-1.5">
            {CHOIX_PAIEMENT.map(({ href, libelle, detail, Icone }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setPaiementOuvert(false)}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-primary-foreground/15"
                >
                  <Icone aria-hidden className="size-4 shrink-0" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold">{libelle}</span>
                    <span className="text-xs text-nuit-doux">{detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="mt-6 flex-1">
        <ul className="flex flex-col gap-1">
          {RUBRIQUES.map(({ href, libelle, Icone, ...r }) => {
            const estActif = actif(href);
            const nombre = "compteur" in r ? compteurs[r.compteur] : 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={estActif ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                    estActif ? "bg-primary-foreground/15 text-primary-foreground" : "text-nuit-doux hover:bg-primary-foreground/10 hover:text-primary-foreground",
                  )}
                >
                  <Icone aria-hidden className="size-5 shrink-0" strokeWidth={estActif ? 2.4 : 1.8} />
                  <span className="flex-1">{libelle}</span>
                  {nombre > 0 && (
                    <span className="min-w-6 rounded-full bg-primary-foreground px-1.5 text-center text-xs leading-6 font-bold text-primary">{nombre}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-1 border-t border-primary-foreground/20 pt-4">
        <Link
          href="/profil"
          aria-current={actif("/profil") ? "page" : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 hover:bg-primary-foreground/10"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-sm font-bold text-primary">{initiales || "?"}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{nom}</span>
            <span className="text-xs text-nuit-doux">Mon profil</span>
          </span>
        </Link>
        <BasculeTheme className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-primary-foreground/15" />
        <form action={seDeconnecter}>
          <button
            type="submit"
            aria-label="Déconnexion"
            title="Déconnexion"
            className="flex size-11 items-center justify-center rounded-full hover:bg-primary-foreground/15"
          >
            <LogOut aria-hidden className="size-5" />
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Le temps de lire la session : la barre teal nuit et le logo, sans rubriques. */
export function SqueletteLaterale() {
  return (
    <div aria-hidden className={CADRE}>
      <span className="flex h-11 items-center px-3">
        <Logo className="text-2xl" />
      </span>
    </div>
  );
}
