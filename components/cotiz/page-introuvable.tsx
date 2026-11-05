import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Page, caisse ou personne introuvable : message en français et retour à l'accueil. */
export function PageIntrouvable() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl bg-card p-6 ring-1 ring-border">
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground">Cette page n&apos;existe pas, ou ce qu&apos;elle affichait n&apos;est plus disponible.</p>
      <Link href="/tableau-de-bord" className={cn(buttonVariants(), "h-11 text-base")}>
        Revenir à l&apos;accueil
      </Link>
    </section>
  );
}
