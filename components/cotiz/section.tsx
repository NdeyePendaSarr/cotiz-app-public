import { cn } from "@/lib/utils";

/** Section de page : titre court (Sora, en minuscules, identité lot 1), puis son contenu. */
export function Section({
  titre,
  action,
  children,
  className,
  pleineLargeur = false,
}: {
  titre: React.ReactNode;
  /** Élément aligné à droite du titre (lien « Tout voir », compteur…). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sur ordinateur, occupe toute la largeur de la colonne (voir .colonne-privee dans globals.css). */
  pleineLargeur?: boolean;
}) {
  return (
    <section data-pleine-largeur={pleineLargeur || undefined} className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Bloc arrondi, sans ombre (lot 2), qui regroupe des lignes séparées par de fins traits. */
export function Bloc({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border rounded-2xl bg-card px-4 ring-1 ring-border", className)}>{children}</div>;
}

/** Classes d'une ligne cliquable dans un Bloc (au moins 44 px de haut). */
export const LIGNE = "flex min-h-14 items-center justify-between gap-3 py-3";
