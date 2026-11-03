import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { creerDepense } from "@/app/actions/depenses";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { avecDepenses } from "@/lib/depenses";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireDepense } from "../formulaire-depense";

export const metadata: Metadata = { title: "Nouvelle dépense · Cotiz" };

export default function PageNouvelleDepense({ params }: PageProps<"/caisses/[id]/depenses/nouvelle">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Nouvelle dépense" /><SqueletteFormulaire /></>}>
      <Creation params={params} />
    </Suspense>
  );
}

async function Creation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse || !avecDepenses(caisse.type) || caisse.statut !== "ACTIVE") notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}?vue=depenses`, libelle: caisse.nom }} titre="Nouvelle dépense" surtitre="Sortie de caisse" />
      <FormulaireDepense
        action={creerDepense.bind(null, caisse.id)}
        // Date du jour à Dakar (UTC) par défaut.
        valeursInitiales={{ date: new Date().toISOString().slice(0, 10), montant: "", motif: "", beneficiaire: "", canal: "", categorie: "" }}
        libelleBouton="Enregistrer la dépense"
      />
    </>
  );
}
