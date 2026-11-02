import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import Link from "next/link";
import { Suspense } from "react";
import { marquerSmsTraite } from "@/app/actions/capture";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { Button, buttonVariants } from "@/components/ui/button";
import { exigerUtilisatrice } from "@/lib/auth";
import { listerSmsNonLus } from "@/lib/donnees/paiements";
import { formaterDateHeure } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "SMS non lus · Cotiz" };

export default function PageSmsNonLus() {
  return (
    <>
      <EnTete titre="SMS non lus">
        <p className="text-sm text-nuit-doux">SMS que l&apos;application n&apos;a pas su lire : crée le paiement à la main, ou écarte-les.</p>
      </EnTete>
      <Suspense fallback={<SqueletteListe />}>
        <Liste />
      </Suspense>
    </>
  );
}

async function Liste() {
  const { id: ownerId } = await exigerUtilisatrice();
  const sms = await listerSmsNonLus(ownerId);
  if (sms.length === 0) return <p className="text-muted-foreground">Aucun SMS à traiter.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {sms.map((s) => (
        <li key={s.id} className="flex flex-col gap-2 rounded-2xl bg-card p-3  ring-1 ring-border">
          <span className="text-sm text-muted-foreground">Collé le {formaterDateHeure(s.dateCollage)}</span>
          <pre className="rounded-2xl bg-muted p-2 text-sm whitespace-pre-wrap">{s.texteBrut}</pre>
          <Link href={`/capture/manuelle?sms=${s.id}`} className={cn(buttonVariants(), "h-11 text-base")}>
            Créer le paiement
          </Link>
          <form action={marquerSmsTraite}>
            <input type="hidden" name="smsId" value={s.id} />
            <Button type="submit" variant="outline" className="h-11 w-full text-base">
              Pas un paiement : écarter
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
