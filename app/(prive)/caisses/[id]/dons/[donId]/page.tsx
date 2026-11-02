import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { modifierDon } from "@/app/actions/dons";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirDon } from "@/lib/donnees/depenses";
import { versChampDate } from "@/lib/format";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireDon } from "../formulaire-don";
import { SupprimerDon } from "./supprimer-don";

export const metadata: Metadata = { title: "Bonne volonté · Cotiz" };

export default function PageDon({ params }: PageProps<"/caisses/[id]/dons/[donId]">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Bonne volonté" /><SqueletteFormulaire /></>}>
      <Modification params={params} />
    </Suspense>
  );
}

async function Modification({ params }: { params: Promise<{ id: string; donId: string }> }) {
  const { donId } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(donId);
  const don = idValide.success ? await obtenirDon(ownerId, idValide.data) : null;
  if (!don) notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${don.caisse.id}?vue=dons`, libelle: don.caisse.nom }} titre="Modifier la bonne volonté" surtitre="Don en plus des cotisations" />
      {don.paiementId && (
        <p className="rounded-2xl bg-secondary p-3 text-sm text-secondary-foreground">
          Surplus d&apos;un paiement : si tu la supprimes, ce montant redevient « à rembourser ».
        </p>
      )}
      <FormulaireDon
        action={modifierDon.bind(null, don.id)}
        valeursInitiales={{ date: versChampDate(don.date), montant: String(don.montant), donateur: don.donateur, remisPar: don.remisPar ?? "", canal: don.canal, note: don.note ?? "" }}
        libelleBouton="Enregistrer"
      />
      <SupprimerDon donId={don.id} />
    </>
  );
}
