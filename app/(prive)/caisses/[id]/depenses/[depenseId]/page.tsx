import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { modifierDepense } from "@/app/actions/depenses";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirDepense } from "@/lib/donnees/depenses";
import { versChampDate } from "@/lib/format";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireDepense } from "../formulaire-depense";
import { SupprimerDepense } from "./supprimer-depense";

export const metadata: Metadata = { title: "Dépense · Cotiz" };

export default function PageDepense({ params }: PageProps<"/caisses/[id]/depenses/[depenseId]">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Dépense" /><SqueletteFormulaire /></>}>
      <Modification params={params} />
    </Suspense>
  );
}

async function Modification({ params }: { params: Promise<{ id: string; depenseId: string }> }) {
  const { depenseId } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(depenseId);
  const depense = idValide.success ? await obtenirDepense(ownerId, idValide.data) : null;
  if (!depense) notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${depense.caisse.id}?vue=depenses`, libelle: depense.caisse.nom }} titre="Modifier la dépense" surtitre="Sortie de caisse" />
      <FormulaireDepense
        action={modifierDepense.bind(null, depense.id)}
        valeursInitiales={{
          date: versChampDate(depense.date),
          montant: String(depense.montant),
          motif: depense.motif,
          beneficiaire: depense.beneficiaire ?? "",
          canal: depense.canal,
          categorie: depense.categorie,
        }}
        libelleBouton="Enregistrer"
      />
      <SupprimerDepense depenseId={depense.id} />
    </>
  );
}
