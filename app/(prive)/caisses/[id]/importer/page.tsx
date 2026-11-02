import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { traiterImport } from "@/app/actions/import";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireImport } from "./formulaire-import";

export const metadata: Metadata = { title: "Importer une liste · Cotiz" };

export default function PageImporter({ params }: PageProps<"/caisses/[id]/importer">) {
  return (
    <>
      <Suspense fallback={<SqueletteFormulaire />}>
        <Import params={params} />
      </Suspense>
    </>
  );
}

async function Import({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse || caisse.statut !== "ACTIVE") notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre="Importer une liste" />
      <p className="text-muted-foreground">Rien n&apos;est enregistré avant ta confirmation, après l&apos;aperçu.</p>
      <FormulaireImport action={traiterImport.bind(null, caisse.id)} caisseId={caisse.id} tontine={caisse.type === "TONTINE"} />
    </>
  );
}
