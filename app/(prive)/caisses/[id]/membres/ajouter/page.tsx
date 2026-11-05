import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ajouterMembre } from "@/app/actions/membres";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { listerPersonnes } from "@/lib/donnees/personnes";
import { rechercherPersonnes } from "@/lib/recherche";
import { formaterTelephone } from "@/lib/telephone";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ajouter un membre · Cotiz" };

const MAX_RESULTATS = 30;

// Inscrire une personne EXISTANTE (aucun doublon créé) ou en créer une nouvelle.
export default function PageAjouterMembre({ params, searchParams }: PageProps<"/caisses/[id]/membres/ajouter">) {
  return (
    <>
      <Suspense fallback={<SqueletteFormulaire />}>
        <Ajout params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Ajout({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  const recherche = typeof q === "string" ? q : "";
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse || caisse.statut !== "ACTIVE" || caisse.type === "COMPTE_GARDE") notFound();

  const personnes = recherche ? rechercherPersonnes(await listerPersonnes(ownerId), recherche) : [];
  const statutDans = (p: (typeof personnes)[number]) => p.membres.find((m) => m.caisseId === caisse.id)?.statut;

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre="Ajouter un membre" />
      <p className="text-muted-foreground">
        Cherche d&apos;abord si la personne existe déjà (elle est peut-être dans une autre caisse).
      </p>

      <form role="search" className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={recherche}
          placeholder="Nom, alias ou numéro"
          aria-label="Rechercher une personne"
          autoFocus
          className="h-11 text-base"
        />
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 px-4 text-base")}>
          Chercher
        </button>
      </form>

      {recherche && (
        <ul className="flex flex-col gap-2">
          {personnes.length === 0 && <li className="text-sm text-muted-foreground">Aucune personne trouvée.</li>}
          {personnes.slice(0, MAX_RESULTATS).map((p) => {
            const statut = statutDans(p);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-card p-2  ring-1 ring-border">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{p.nomComplet}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.numeros.map((n) => formaterTelephone(n.numero)).join(" · ") || "sans numéro"}
                  </span>
                </div>
                {statut === "ACTIF" ? (
                  <span className="shrink-0 text-sm text-muted-foreground">Déjà membre</span>
                ) : (
                  <form action={ajouterMembre}>
                    <input type="hidden" name="caisseId" value={caisse.id} />
                    <input type="hidden" name="personneId" value={p.id} />
                    <Button type="submit" className="h-11">
                      {statut === "INACTIF" ? "Réactiver" : "Inscrire"}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
          {personnes.length > MAX_RESULTATS && (
            <li className="text-sm text-muted-foreground">Affine la recherche : {personnes.length} résultats.</li>
          )}
        </ul>
      )}

      <Link
        href={`/personnes/nouvelle?caisse=${caisse.id}`}
        className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}
      >
        Nouvelle personne
      </Link>
    </>
  );
}
