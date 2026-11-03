import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bouton blanc posé sur l'en-tête teal (action principale d'une page). */
export const BOUTON_EN_TETE = cn(
  buttonVariants({ variant: "secondary" }),
  "mt-3 w-fit bg-primary-foreground text-base text-primary hover:bg-primary-foreground/90",
);

/** Chiffre clé affiché côte à côte dans le bandeau, sur ordinateur. */
export type ChiffreCle = {
  libelle: string;
  valeur: string;
  /** Petite ligne sous le chiffre (« 17 % de 160 000 FCFA »). */
  detail?: string;
  /** Le chiffre que l'on cherche (restant en caisse) : en or. */
  accent?: boolean;
  alerte?: boolean;
};

/**
 * En-tête « héros » des pages de chiffres : bloc teal nuit qui prolonge la barre du haut et se termine
 * par un grand arrondi (charte de la refonte). Il sort de la colonne centrale (marges négatives calculées sur la largeur de l'écran)
 * pour occuper toute la largeur, le contenu restant centré sur max-w-md.
 * Sur ordinateur (lg) : bandeau arrondi dans la colonne, fil d'Ariane (« Caisses › Collecte ») et,
 * si `chiffres` est donné, les chiffres clés sur une ligne en bas du bandeau (ils remplacent alors le grand
 * montant), avec `aCote` à leur gauche (anneau des statuts) et `action` à droite du titre : bandeau compact
 * (retouches du 03/11/2026), le contenu de la page remonte.
 * `leger` (formulaires) : simple titre sur le fond de la page, sans bandeau (identité, lot 1).
 */
export function EnTete({
  titre,
  retour,
  surtitre,
  montant,
  chiffres,
  children,
  className,
  leger = false,
  aCote,
  action,
}: {
  titre: React.ReactNode;
  /** Lien de retour affiché au-dessus du titre. */
  retour?: { href: string; libelle: string };
  /** Petit libellé sous le titre (au-dessus du montant), en texte normal (audit, lot 2). */
  surtitre?: React.ReactNode;
  /** Grand chiffre (déjà formaté), ex. « 84 500 FCFA ». */
  montant?: React.ReactNode;
  /** Chiffres clés du bandeau, sur ordinateur seulement (le téléphone garde le grand montant). */
  chiffres?: ChiffreCle[];
  children?: React.ReactNode;
  className?: string;
  /** En-tête léger, sans bandeau : pour les formulaires. */
  leger?: boolean;
  /** Ordinateur : élément à gauche des chiffres (ex. anneau des statuts). */
  aCote?: React.ReactNode;
  /** Ordinateur : élément à droite du titre (ex. « Changer de caisse »). */
  action?: React.ReactNode;
}) {
  const avecChiffres = !leger && chiffres !== undefined && chiffres.length > 0;
  return (
    <header
      className={cn(
        leger
          ? "pt-1 lg:pt-0"
          : [
              "-mt-4 mb-1 mx-[calc(50%-50vw)] rounded-b-3xl bg-nuit px-5 pt-1 pb-7 text-primary-foreground",
              "lg:m-0 lg:overflow-hidden lg:rounded-3xl lg:px-10 lg:pt-6 lg:pb-9 lg:shadow-lg",
            ],
        className,
      )}
    >
      <div className={cn("mx-auto flex w-full flex-col gap-1 lg:max-w-none", !leger && "max-w-md")}>
        <div className="flex min-w-0 flex-col gap-1">
          {retour && (
            <nav aria-label="Fil d'Ariane" className={cn("flex items-center gap-1 text-sm", leger ? "text-primary" : "text-nuit-doux")}>
              <Link
                href={retour.href}
                className={cn(
                  "-ml-2 flex h-11 w-fit items-center gap-1 pr-2 font-medium lg:ml-0 lg:h-8 lg:pr-0 lg:hover:underline",
                  !leger && "lg:hover:text-primary-foreground",
                )}
              >
                <ChevronLeft aria-hidden className="size-5 lg:hidden" />
                {retour.libelle}
              </Link>
              {typeof titre === "string" && (
                <span aria-current="page" className="hidden min-w-0 items-center gap-1 lg:flex">
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                  <span className={cn("truncate font-semibold", leger ? "text-foreground" : "text-primary-foreground")}>{titre}</span>
                </span>
              )}
            </nav>
          )}
          <div className="flex items-start justify-between gap-4">
            <h1 className={cn("font-semibold tracking-tight lg:text-3xl", montant !== undefined ? "text-lg" : "text-2xl")}>{titre}</h1>
            {action && <div className="hidden shrink-0 lg:block">{action}</div>}
          </div>
          {surtitre && <p className={cn("text-sm lg:text-base", leger ? "text-muted-foreground" : "text-nuit-doux")}>{surtitre}</p>}
          {montant !== undefined && (
            <p className={cn("font-heading text-4xl font-bold tracking-tight lg:mt-2 lg:text-5xl", avecChiffres && "lg:hidden")}>{montant}</p>
          )}
          {children}
        </div>
        {avecChiffres && (
          <div className={cn("mt-4 hidden items-center gap-6 lg:grid", aCote ? "lg:grid-cols-[auto_minmax(0,1fr)]" : "lg:grid-cols-1")}>
            {aCote}
            {/* Chiffres séparés par de fins traits (plus de cases). Sur une ligne seulement si la place le permet
                (@2xl : 42 rem, mesurée sur le bloc lui-même), sinon 3 + 2 ; la taille suit la place : jamais de débordement. */}
            <div className={cn("@container min-w-0", aCote && "border-l border-primary-foreground/20")}>
            <dl className="grid grid-cols-3 gap-y-3 @2xl:auto-cols-fr @2xl:grid-flow-col @2xl:grid-cols-none">
              {chiffres.map((c, i) => (
                <div
                  key={c.libelle}
                  className={cn("min-w-0 px-3", i > 0 && "@2xl:border-l @2xl:border-primary-foreground/20", c.alerte && "rounded-xl bg-primary-foreground py-1 text-retard")}
                >
                  <dt className={cn("truncate text-xs font-medium text-nuit-doux", c.alerte && "text-retard")}>{c.libelle}</dt>
                  {/* « FCFA » en petit : le nombre reste lisible et la colonne étroite. */}
                  <dd className={cn("font-heading text-base font-bold tracking-tight whitespace-nowrap @4xl:text-lg @6xl:text-xl", c.accent && !c.alerte && "text-or")}>
                    {c.valeur.endsWith(" FCFA") ? (
                      <>
                        {c.valeur.slice(0, -5)}
                        <span className="ml-1 text-xs font-semibold">FCFA</span>
                      </>
                    ) : (
                      c.valeur
                    )}
                  </dd>
                  {c.detail && <dd className={cn("truncate text-xs text-nuit-doux", c.alerte && "text-retard")}>{c.detail}</dd>}
                </div>
              ))}
            </dl>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/** Barre de progression or (l'argent reçu), à placer dans l'en-tête (reçu sur attendu). */
export function Progression({ valeur, total, libelle, className }: { valeur: number; total: number; libelle: string; className?: string }) {
  const pourcentage = total > 0 ? Math.min(100, Math.round((valeur / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={libelle}
      aria-valuenow={pourcentage}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/20", className)}
    >
      <div className="h-full rounded-full bg-or" style={{ width: `${pourcentage}%` }} />
    </div>
  );
}
