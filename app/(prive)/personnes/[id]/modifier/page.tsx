import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { modifierPersonne } from "@/app/actions/personnes";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirPersonne } from "@/lib/donnees/personnes";
import { formaterTelephone } from "@/lib/telephone";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulairePersonne } from "../../formulaire-personne";

export const metadata: Metadata = { title: "Modifier · Cotiz" };

// Modification d'une personne (audit, lot 2) : séparée de la fiche, qui s'ouvre en lecture.
export default function PageModifierPersonne({ params }: PageProps<"/personnes/[id]/modifier">) {
  return (
    <Suspense fallback={<><EnTete leger retour={{ href: "/personnes", libelle: "Personnes" }} titre="…" /><SqueletteFormulaire /></>}>
      <Modification params={params} />
    </Suspense>
  );
}

async function Modification({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const personne = idValide.success ? await obtenirPersonne(ownerId, idValide.data) : null;
  if (!personne) notFound();

  return (
    <>
      <EnTete leger retour={{ href: `/personnes/${personne.id}`, libelle: personne.nomComplet }} titre="Modifier" surtitre={personne.nomComplet} />
      <FormulairePersonne
        action={modifierPersonne.bind(null, personne.id)}
        valeursInitiales={{
          nomComplet: personne.nomComplet,
          cellule: personne.cellule ?? "",
          // Affichés au format « 77 123 45 67 » ; la validation les remet sur 9 chiffres.
          numeros: personne.numeros.map((n) => ({ numero: formaterTelephone(n.numero), libelle: n.libelle ?? "" })),
          aliasWave: personne.aliasWave,
        }}
        libelleBouton="Enregistrer"
      />
    </>
  );
}
