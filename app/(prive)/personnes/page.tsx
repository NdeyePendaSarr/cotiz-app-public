import { ChevronRight, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { BOUTON_EN_TETE, EnTete } from "@/components/cotiz/en-tete";
import Link from "next/link";
import { Suspense } from "react";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { buttonVariants } from "@/components/ui/button";
import { Bloc, LIGNE } from "@/components/cotiz/section";
import { Input } from "@/components/ui/input";
import { exigerUtilisatrice } from "@/lib/auth";
import { listerPersonnes } from "@/lib/donnees/personnes";
import { rechercherPersonnes } from "@/lib/recherche";
import { formaterTelephone } from "@/lib/telephone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Personnes · Cotiz" };

export default function PagePersonnes({ searchParams }: PageProps<"/personnes">) {
  return (
    <>
      <EnTete titre="Personnes" surtitre="Membres de toutes les caisses">
        <Link href="/personnes/nouvelle" className={BOUTON_EN_TETE}>
          <UserPlus aria-hidden />
          Nouvelle personne
        </Link>
      </EnTete>
      <Suspense fallback={<SqueletteListe />}>
        <ListePersonnes searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ListePersonnes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const recherche = typeof q === "string" ? q : "";
  const { id: ownerId } = await exigerUtilisatrice();
  const toutes = await listerPersonnes(ownerId);
  const personnes = rechercherPersonnes(toutes, recherche);

  return (
    <>
      {/* Formulaire GET : la recherche reste dans l'URL (?q=…), sans JavaScript. */}
      <form role="search" className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={recherche}
          placeholder="Nom, alias ou numéro"
          aria-label="Rechercher une personne"
          className="text-base"
        />
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "shrink-0 text-base")}>
          Chercher
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        {recherche
          ? `${personnes.length} résultat${personnes.length > 1 ? "s" : ""} sur ${toutes.length} personne${toutes.length > 1 ? "s" : ""}`
          : `${toutes.length} personne${toutes.length > 1 ? "s" : ""}`}
      </p>

      {personnes.length > 0 && (
        // Ordinateur : tableau ; toute la ligne ouvre la fiche (lien étiré sur la ligne).
        <div data-pleine-largeur className="hidden overflow-x-auto rounded-2xl bg-card ring-1 ring-border lg:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="h-11 px-4 font-semibold">Nom</th>
                <th scope="col" className="px-3 font-semibold">Cellule</th>
                <th scope="col" className="px-3 font-semibold">Numéros</th>
                <th scope="col" className="px-3 font-semibold">Caisses</th>
                <th scope="col" className="w-10">
                  <span className="sr-only">Ouvrir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {personnes.map((p) => (
                <tr key={p.id} className="relative h-14 transition-colors hover:bg-secondary/50">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                        {initiales(p.nomComplet)}
                      </span>
                      <Link href={`/personnes/${p.id}`} className="font-semibold after:absolute after:inset-0">
                        {p.nomComplet}
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-primary">{p.cellule ?? <span className="text-muted-foreground">–</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                    {p.numeros.length === 0 ? "–" : p.numeros.map((n) => <span key={n.numero} className="block">{formaterTelephone(n.numero)}</span>)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{caissesActives(p).map((m) => m.caisse.nom).join(", ") || "Aucune caisse"}</td>
                  <td className="pr-3 text-muted-foreground">
                    <ChevronRight aria-hidden className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {personnes.length > 0 && (
        <Bloc className="lg:hidden">
          {personnes.map((p) => {
            const caisses = caissesActives(p);
            return (
              <Link key={p.id} href={`/personnes/${p.id}`} className={LIGNE}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                  {initiales(p.nomComplet)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{p.nomComplet}</span>
                  {p.numeros.length > 0 && (
                    <span className="text-xs text-muted-foreground">{p.numeros.map((n) => formaterTelephone(n.numero)).join(" · ")}</span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {p.cellule && <span className="font-semibold text-primary">{p.cellule} · </span>}
                    {caisses.length === 0 ? "Aucune caisse" : caisses.map((m) => m.caisse.nom).join(", ")}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </Bloc>
      )}
    </>
  );
}

/** Caisses où la personne est membre active (caisses non archivées). */
function caissesActives(p: { membres: { statut: string; caisse: { nom: string; statut: string } }[] }) {
  return p.membres.filter((m) => m.statut === "ACTIF" && m.caisse.statut === "ACTIVE");
}

/** « Awa Diop » → « AD » (pastille de la liste). */
function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
}
