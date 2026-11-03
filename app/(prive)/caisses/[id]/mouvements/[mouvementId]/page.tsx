import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { modifierMouvement } from "@/app/actions/comptes";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirMouvement } from "@/lib/donnees/comptes";
import { versChampDate } from "@/lib/format";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireMouvement } from "../formulaire-mouvement";
import { SupprimerMouvement } from "./supprimer-mouvement";

export const metadata: Metadata = { title: "Mouvement · Cotiz" };

export default function PageMouvement({ params }: PageProps<"/caisses/[id]/mouvements/[mouvementId]">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Mouvement" /><SqueletteFormulaire /></>}>
      <Modification params={params} />
    </Suspense>
  );
}

async function Modification({ params }: { params: Promise<{ id: string; mouvementId: string }> }) {
  const { mouvementId } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(mouvementId);
  const mouvement = idValide.success ? await obtenirMouvement(ownerId, idValide.data) : null;
  if (!mouvement) notFound();
  // Versement venu d'un paiement rapproché : il se gère depuis le paiement (annuler le rapprochement).
  if (mouvement.paiementId) redirect(`/paiements/${mouvement.paiementId}`);

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${mouvement.caisse.id}`, libelle: mouvement.caisse.nom }} titre="Modifier le mouvement" surtitre="Compte gardé" />
      <FormulaireMouvement
        action={modifierMouvement.bind(null, mouvement.id)}
        valeursInitiales={{ date: versChampDate(mouvement.date), montant: String(mouvement.montant), sens: mouvement.sens, canal: mouvement.canal, note: mouvement.note ?? "" }}
        libelleBouton="Enregistrer"
      />
      <SupprimerMouvement mouvementId={mouvement.id} />
    </>
  );
}
