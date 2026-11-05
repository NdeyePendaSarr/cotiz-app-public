import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { Suspense } from "react";
import { creerPersonne } from "@/app/actions/personnes";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulairePersonne } from "../formulaire-personne";

export const metadata: Metadata = { title: "Nouvelle personne · Cotiz" };

// ?caisse=<id> : la personne créée est aussi inscrite dans cette caisse.
export default function PageNouvellePersonne({ searchParams }: PageProps<"/personnes/nouvelle">) {
  return (
    <>
      <Suspense fallback={<SqueletteFormulaire />}>
        <Creation searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Creation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { caisse: idCaisse } = await searchParams;
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(idCaisse);
  const caisse = id.success ? await obtenirCaisse(ownerId, id.data) : null;
  const inscriptionPossible = caisse?.statut === "ACTIVE" && caisse.type !== "COMPTE_GARDE";

  return (
    <>
      <EnTete leger retour={{ href: inscriptionPossible ? `/caisses/${caisse.id}` : "/personnes", libelle: inscriptionPossible ? caisse.nom : "Personnes" }} titre="Nouvelle personne" />
      {inscriptionPossible && <p className="text-muted-foreground">Elle sera inscrite dans « {caisse.nom} ».</p>}
      <FormulairePersonne
        action={creerPersonne.bind(null, inscriptionPossible ? caisse.id : null)}
        caisseId={inscriptionPossible ? caisse.id : undefined}
        libelleBouton={inscriptionPossible ? "Créer et inscrire" : "Créer la personne"}
      />
    </>
  );
}
