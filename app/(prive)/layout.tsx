import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { seDeconnecter } from "@/app/actions/auth";
import { Logo } from "@/components/cotiz/logo";
import { exigerUtilisatrice, profilUtilisatrice } from "@/lib/auth";
import { compterSmsNonLus } from "@/lib/donnees/paiements";
import { compterARapprocher } from "@/lib/donnees/rapprochement";
import { compterARembourser } from "@/lib/donnees/suivi";
import { Annonce } from "./annonce";
import { BarreLaterale, SqueletteLaterale } from "./barre-laterale";
import { BarreOnglets, SqueletteOnglets } from "./barre-onglets";

// Espace privé. La lecture de la session (cookies) est isolée dans un <Suspense> :
// avec les Cache Components, le reste de la page s'affiche sans l'attendre.
// Mise en page (refonte) : barre teal nuit en haut, prolongée par l'en-tête de chaque page
// (components/cotiz/en-tete.tsx), et barre d'onglets fixe en bas, à portée de pouce.
// Sur ordinateur (lg, 1 024 px et plus) : barre latérale teal fixe à gauche à la place des deux
// barres, et une colonne large (la règle .colonne-privee de globals.css garde les formulaires lisibles).
export default function LayoutPrive({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:pl-64">
      <header className="bg-nuit px-4 pt-[env(safe-area-inset-top)] text-primary-foreground lg:hidden">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2">
          <Link href="/tableau-de-bord" aria-label="Cotiz, accueil" className="flex h-11 items-center">
            <Logo className="text-xl" />
          </Link>
          <Suspense fallback={null}>
            <MenuUtilisatrice />
          </Suspense>
        </div>
      </header>
      {/* Marge basse : la barre d'onglets fixe ne doit pas cacher la fin de la page. */}
      <main className="flex flex-1 flex-col overflow-x-clip px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:px-10 lg:pt-8 lg:pb-12">
        <div className="colonne-privee mx-auto flex w-full max-w-md flex-1 flex-col gap-5 lg:max-w-7xl lg:gap-6">{children}</div>
      </main>
      {/* usePathname() est une donnée de la requête : sous <Suspense> avec les Cache Components. */}
      {/* Messages de confirmation après une action (lib/annonce.ts). */}
      <Annonce />
      <Suspense
        fallback={
          <>
            <SqueletteOnglets />
            <SqueletteLaterale />
          </>
        }
      >
        <Navigation />
      </Suspense>
    </div>
  );
}

/** Onglets du bas (téléphone) et barre latérale (ordinateur), avec les compteurs de ce qui attend. */
async function Navigation() {
  const { id: ownerId } = await exigerUtilisatrice();
  // Nom et compteurs lus en même temps.
  const [utilisatrice, aRapprocher, smsNonLus, aRembourser] = await Promise.all([
    profilUtilisatrice(),
    compterARapprocher(ownerId),
    compterSmsNonLus(ownerId),
    compterARembourser(ownerId),
  ]);
  return (
    <>
      <BarreOnglets aRapprocher={aRapprocher} />
      <BarreLaterale compteurs={{ aRapprocher, smsNonLus, aRembourser }} nom={utilisatrice.nom} initiales={initialesDe(utilisatrice.nom)} />
    </>
  );
}

function initialesDe(nom: string) {
  return nom
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
}

/** Initiales de la trésorière et bouton de déconnexion (téléphone). */
async function MenuUtilisatrice() {
  const utilisatrice = await profilUtilisatrice();
  const initiales = initialesDe(utilisatrice.nom);
  return (
    <form action={seDeconnecter} className="flex items-center gap-2">
      {/* Initiales : ouvrent « Mon profil » (nom d'affichage). Cible de 44 px autour du rond. */}
      <Link href="/profil" aria-label={`Mon profil (${utilisatrice.nom})`} title="Mon profil" className="flex size-11 items-center justify-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground text-sm font-bold text-primary">{initiales || "?"}</span>
      </Link>
      <button
        type="submit"
        aria-label="Déconnexion"
        title="Déconnexion"
        className="flex size-11 items-center justify-center rounded-full hover:bg-primary-foreground/15"
      >
        <LogOut aria-hidden className="size-5" />
      </button>
    </form>
  );
}
