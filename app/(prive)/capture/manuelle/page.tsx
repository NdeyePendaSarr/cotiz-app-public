import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { NeufAChaqueVisite } from "@/components/cotiz/neuf-a-chaque-visite";
import { Suspense } from "react";
import { saisirPaiement } from "@/app/actions/capture";
import { SqueletteFormulaire } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { obtenirSmsNonLu } from "@/lib/donnees/paiements";
import { personnesPourMatching } from "@/lib/donnees/rapprochement";
import { formaterDateHeure } from "@/lib/format";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { SaisieManuelle } from "./saisie-manuelle";

export const metadata: Metadata = { title: "Saisie manuelle · Cotiz" };

// ?sms=<id> : saisie faite à partir d'un SMS illisible, affiché au-dessus du formulaire.
export default function PageSaisieManuelle({ searchParams }: PageProps<"/capture/manuelle">) {
  return (
    <Suspense fallback={<><EnTete leger titre="Saisie manuelle" /><SqueletteFormulaire /></>}>
      <Saisie searchParams={searchParams} />
    </Suspense>
  );
}

async function Saisie({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { sms: idSms } = await searchParams;
  const { id: ownerId } = await exigerUtilisatrice();
  const id = schemaIdentifiant.safeParse(idSms);
  const [sms, personnes] = await Promise.all([id.success ? obtenirSmsNonLu(ownerId, id.data) : null, personnesPourMatching(ownerId)]);

  // « Maintenant » à Dakar (UTC), pour pré-remplir date et heure.
  const maintenant = new Date().toISOString();
  const defauts = { date: maintenant.slice(0, 10), heure: maintenant.slice(11, 16) };

  return (
    <>
      <EnTete leger
        titre="Saisie manuelle"
        retour={sms ? { href: "/sms-non-lus", libelle: "SMS non lus" } : { href: "/capture", libelle: "Coller un SMS" }}
        surtitre={sms ? "Depuis un SMS illisible" : "Wave sans SMS, Orange Money ou cash"}
      />
      {sms && (
        <section className="flex flex-col gap-1 rounded-2xl bg-muted p-3">
          <span className="text-sm text-muted-foreground">SMS collé le {formaterDateHeure(sms.dateCollage)} :</span>
          <pre className="text-sm whitespace-pre-wrap">{sms.texteBrut}</pre>
        </section>
      )}
      <NeufAChaqueVisite>
        <SaisieManuelle action={saisirPaiement.bind(null, sms?.id ?? null)} personnes={personnes} defauts={defauts} depuisSms={Boolean(sms)} />
      </NeufAChaqueVisite>
    </>
  );
}
