import type { Metadata } from "next";
import { Monogramme } from "@/components/cotiz/logo";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion · Cotiz" };

// Page statique : la session n'est pas lue ici (proxy.ts renvoie une utilisatrice
// déjà connectée vers le tableau de bord).
// Charte : grand bloc teal nuit arrondi en haut, avec le monogramme (comme l'écran d'accueil de la maquette),
// formulaire sur une carte blanche qui le chevauche.
export default function PageConnexion() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="rounded-b-3xl bg-nuit px-6 pt-[calc(4rem+env(safe-area-inset-top))] pb-24 text-center text-primary-foreground">
        <span className="mx-auto flex size-18 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Monogramme className="size-11" />
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">cotiz</h1>
        <p className="mt-1 text-base text-nuit-doux">Les cotisations de tes tontines, au clair.</p>
      </div>
      <div className="-mt-14 px-4 pb-10">
        <div className="mx-auto w-full max-w-sm rounded-3xl bg-card p-6 shadow-lg ring-1 ring-border">
          <h2 className="mb-4 text-lg font-semibold">Connexion</h2>
          <FormulaireConnexion />
        </div>
      </div>
    </main>
  );
}
