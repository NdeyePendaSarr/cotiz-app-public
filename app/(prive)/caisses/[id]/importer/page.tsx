import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { NeufAChaqueVisite } from "@/components/cotiz/neuf-a-chaque-visite";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { traiterImport } from "@/app/actions/import";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { importerHistoriqueCompte } from "@/app/actions/comptes";
import { FormulaireImport } from "./formulaire-import";
import { FormulaireImportCompte } from "./formulaire-import-compte";

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

  // Compte gardé : on reprend des versements et des retraits, pas une liste de membres.
  if (caisse.type === "COMPTE_GARDE") {
    return (
      <>
        <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre="Reprendre l'historique" surtitre="Compte gardé" />
        <p className="text-muted-foreground">
          Rien n&apos;est enregistré avant ta confirmation, après l&apos;aperçu. Un mouvement déjà dans Cotiz (même jour, même sens, même montant) n&apos;est
          jamais compté deux fois.
        </p>
        <NeufAChaqueVisite>
          <FormulaireImportCompte action={importerHistoriqueCompte.bind(null, caisse.id)} caisseId={caisse.id} />
        </NeufAChaqueVisite>
      </>
    );
  }

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre="Importer une liste" />
      <p className="text-muted-foreground">Rien n&apos;est enregistré avant ta confirmation, après l&apos;aperçu.</p>
      <NeufAChaqueVisite>
        <FormulaireImport action={traiterImport.bind(null, caisse.id)} caisseId={caisse.id} tontine={caisse.type === "TONTINE"} />
      </NeufAChaqueVisite>
    </>
  );
}
