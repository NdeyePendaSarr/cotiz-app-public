import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { creerDon } from "@/app/actions/dons";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireDon } from "../formulaire-don";

export const metadata: Metadata = { title: "Nouvelle bonne volonté · Cotiz" };

export default function PageNouveauDon({ params }: PageProps<"/caisses/[id]/dons/nouvelle">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Nouvelle bonne volonté" /><SqueletteFormulaire /></>}>
      <Creation params={params} />
    </Suspense>
  );
}

async function Creation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse || caisse.type !== "COLLECTE" || caisse.statut !== "ACTIVE") notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}?vue=dons`, libelle: caisse.nom }} titre="Nouvelle bonne volonté" surtitre="Don en plus des cotisations" />
      <FormulaireDon
        action={creerDon.bind(null, caisse.id)}
        // Date du jour à Dakar (UTC) par défaut.
        valeursInitiales={{ date: new Date().toISOString().slice(0, 10), montant: "", donateur: "", remisPar: "", canal: "", note: "" }}
        libelleBouton="Enregistrer la bonne volonté"
      />
    </>
  );
}
