import type { Metadata } from "next";
import { Suspense } from "react";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { creerCaisse } from "@/app/actions/caisses";
import { exigerUtilisatrice } from "@/lib/auth";
import { personnesPourMatching } from "@/lib/donnees/rapprochement";
import { FormulaireCaisse } from "../formulaire-caisse";

export const metadata: Metadata = { title: "Nouvelle caisse · Cotiz" };

// Les personnes (titulaire d'un compte gardé) sont lues sous <Suspense> ; creerCaisse revérifie tout.
export default function PageNouvelleCaisse() {
  return (
    <>
      <EnTete leger retour={{ href: "/caisses", libelle: "Caisses" }} titre="Nouvelle caisse" />
      <Suspense fallback={<SqueletteFormulaire />}>
        <Creation />
      </Suspense>
    </>
  );
}

async function Creation() {
  const { id: ownerId } = await exigerUtilisatrice();
  const personnes = await personnesPourMatching(ownerId);
  return <FormulaireCaisse action={creerCaisse} libelleBouton="Créer la caisse" personnes={personnes} />;
}
