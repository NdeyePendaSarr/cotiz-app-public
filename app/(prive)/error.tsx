"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Erreur inattendue dans une page privée (audit, lot 1) : base injoignable, coupure réseau…
 * Message en français, « Réessayer » (retry() de Next 16) et retour à l'accueil. Le détail technique
 * n'est pas affiché ; son identifiant (digest) permet de retrouver l'erreur dans les journaux du serveur.
 */
export default function ErreurPrivee({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <section role="alert" className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl bg-card p-6 ring-1 ring-border">
      <h1 className="text-xl font-semibold">Un problème est survenu</h1>
      <p className="text-muted-foreground">
        La page n&apos;a pas pu s&apos;afficher, souvent à cause d&apos;une connexion lente ou coupée. Rien n&apos;a été perdu : réessaie dans un
        instant.
      </p>
      <Button type="button" onClick={() => retry()} className="h-11 text-base">
        <RotateCcw aria-hidden />
        Réessayer
      </Button>
      <Link href="/tableau-de-bord" className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}>
        Revenir à l&apos;accueil
      </Link>
      {digest && <p className="text-xs text-muted-foreground">Référence de l&apos;erreur : {digest}</p>}
    </section>
  );
}
