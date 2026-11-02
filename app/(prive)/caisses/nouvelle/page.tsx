import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { creerCaisse } from "@/app/actions/caisses";
import { FormulaireCaisse } from "../formulaire-caisse";

export const metadata: Metadata = { title: "Nouvelle caisse · Cotiz" };

// Aucune donnée lue ici : la Server Action creerCaisse vérifie elle-même la session.
export default function PageNouvelleCaisse() {
  return (
    <>
      <EnTete leger retour={{ href: "/caisses", libelle: "Caisses" }} titre="Nouvelle caisse" />
      <FormulaireCaisse action={creerCaisse} libelleBouton="Créer la caisse" />
    </>
  );
}
