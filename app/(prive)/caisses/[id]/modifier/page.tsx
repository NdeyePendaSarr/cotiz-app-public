import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { modifierCaisse } from "@/app/actions/caisses";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { versChampDate } from "@/lib/format";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireCaisse } from "../../formulaire-caisse";

export const metadata: Metadata = { title: "Modifier la caisse · Cotiz" };

export default function PageModifierCaisse({ params }: PageProps<"/caisses/[id]/modifier">) {
  return (
    <>
      <Suspense fallback={<SqueletteFormulaire />}>
        <Modification params={params} />
      </Suspense>
    </>
  );
}

async function Modification({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse) notFound();

  // Valeurs de départ du formulaire, au format texte des champs HTML.
  const valeurs: Record<string, string> = {
    type: caisse.type,
    nom: caisse.nom,
    montantCotisation: String(caisse.montantCotisation),
    ...(caisse.frequence && { frequence: caisse.frequence }),
    ...(caisse.jourEcheance && { jourEcheance: String(caisse.jourEcheance) }),
    ...(caisse.dateLimite && { dateLimite: versChampDate(caisse.dateLimite) }),
    ...(caisse.modeleRelance && { modeleRelance: caisse.modeleRelance }),
  };

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre={caisse.type === "COMPTE_GARDE" ? "Renommer le compte" : "Modifier la caisse"} />
      {caisse.type !== "COMPTE_GARDE" && (
        <p className="text-sm text-muted-foreground">
          Un nouveau montant ne s&apos;applique qu&apos;aux cycles futurs : les échéances déjà créées gardent leur montant.
        </p>
      )}
      <FormulaireCaisse
        action={modifierCaisse.bind(null, caisse.id)}
        valeursInitiales={valeurs}
        typeVerrouille
        libelleBouton="Enregistrer"
      />
    </>
  );
}
