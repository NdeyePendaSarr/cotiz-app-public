import { BoutonEnvoi } from "@/components/cotiz/bouton-envoi";
import type { Metadata } from "next";
import { Suspense } from "react";
import { seDeconnecter } from "@/app/actions/auth";
import { EnTete } from "@/components/cotiz/en-tete";
import { Bloc, Section } from "@/components/cotiz/section";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { ChoixTheme } from "@/components/cotiz/theme";
import { profilUtilisatrice } from "@/lib/auth";
import { FormulaireProfil } from "./formulaire-profil";

export const metadata: Metadata = { title: "Mon profil · Cotiz" };

export default function PageProfil() {
  return (
    <Suspense fallback={<><EnTete leger titre="Mon profil" /><SqueletteFormulaire /></>}>
      <Profil />
    </Suspense>
  );
}

async function Profil() {
  const utilisatrice = await profilUtilisatrice();
  return (
    <>
      <EnTete leger titre="Mon profil" surtitre={utilisatrice.email} />
      <Section titre="Nom d'affichage">
        <Bloc className="py-4">
          <FormulaireProfil nom={utilisatrice.nom} />
        </Bloc>
      </Section>
      <Section titre="Apparence">
        <ChoixTheme />
        <p className="text-xs text-muted-foreground">« Automatique » suit le réglage de ce téléphone ou de cet ordinateur. Choix enregistré sur cet appareil.</p>
      </Section>
      <form action={seDeconnecter}>
        <BoutonEnvoi variant="outline" className="w-full text-base">
          Se déconnecter
        </BoutonEnvoi>
      </form>
    </>
  );
}
