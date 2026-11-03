import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { creerMouvement } from "@/app/actions/comptes";
import { EnTete } from "@/components/cotiz/en-tete";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { FormulaireMouvement } from "../formulaire-mouvement";

export const metadata: Metadata = { title: "Nouveau mouvement · Cotiz" };

// ?sens=VERSEMENT | RETRAIT : le bouton choisi sur la page du compte (modifiable dans le formulaire).
export default function PageNouveauMouvement({ params, searchParams }: PageProps<"/caisses/[id]/mouvements/nouveau">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Nouveau mouvement" /><SqueletteFormulaire /></>}>
      <Creation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TITRES = { VERSEMENT: "Nouveau versement", RETRAIT: "Nouveau retrait", "": "Nouveau mouvement" } as const;

async function Creation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, { sens }] = await Promise.all([params, searchParams]);
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const caisse = idValide.success ? await obtenirCaisse(ownerId, idValide.data) : null;
  if (!caisse || caisse.type !== "COMPTE_GARDE" || caisse.statut !== "ACTIVE") notFound();
  const sensInitial = sens === "VERSEMENT" || sens === "RETRAIT" ? sens : "";

  return (
    <>
      <EnTete leger retour={{ href: `/caisses/${caisse.id}`, libelle: caisse.nom }} titre={TITRES[sensInitial]} surtitre="Compte gardé" />
      <FormulaireMouvement
        action={creerMouvement.bind(null, caisse.id)}
        // Date du jour à Dakar (UTC) par défaut.
        valeursInitiales={{ date: new Date().toISOString().slice(0, 10), montant: "", sens: sensInitial, canal: "", note: "" }}
        libelleBouton="Enregistrer"
      />
    </>
  );
}
