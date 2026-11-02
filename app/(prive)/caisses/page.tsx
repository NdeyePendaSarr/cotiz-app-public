import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BOUTON_EN_TETE, EnTete } from "@/components/cotiz/en-tete";
import { Pastille } from "@/components/cotiz/pastille";
import { Bloc, LIGNE, Section } from "@/components/cotiz/section";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { listerCaisses } from "@/lib/donnees/caisses";
import { formaterDate, formaterFCFA, libelleEcheance, LIBELLES_TYPE } from "@/lib/format";

export const metadata: Metadata = { title: "Caisses · Cotiz" };

export default function PageCaisses() {
  return (
    <>
      <EnTete titre="Mes caisses" surtitre="Tontines et collectes">
        <Link href="/caisses/nouvelle" className={BOUTON_EN_TETE}>
          <Plus aria-hidden />
          Nouvelle caisse
        </Link>
      </EnTete>
      <Suspense fallback={<SqueletteListe />}>
        <ListeCaisses />
      </Suspense>
    </>
  );
}

async function ListeCaisses() {
  const { id: ownerId } = await exigerUtilisatrice();
  const caisses = await listerCaisses(ownerId);
  const actives = caisses.filter((c) => c.statut === "ACTIVE");
  const archivees = caisses.filter((c) => c.statut === "ARCHIVEE");

  if (caisses.length === 0) {
    return <p className="text-muted-foreground">Aucune caisse pour l&apos;instant. Commence par en créer une.</p>;
  }

  return (
    <>
      {actives.length > 0 && (
        <Section titre={`Actives (${actives.length})`}>
          <Bloc>
            {actives.map((c) => (
              <LigneCaisse key={c.id} caisse={c} />
            ))}
          </Bloc>
        </Section>
      )}
      {archivees.length > 0 && (
        <details>
          <summary className="flex h-11 cursor-pointer items-center text-sm font-semibold text-muted-foreground">
            Caisses archivées ({archivees.length})
          </summary>
          <Bloc className="opacity-70">
            {archivees.map((c) => (
              <LigneCaisse key={c.id} caisse={c} />
            ))}
          </Bloc>
        </details>
      )}
    </>
  );
}

type Caisse = Awaited<ReturnType<typeof listerCaisses>>[number];

function LigneCaisse({ caisse: c }: { caisse: Caisse }) {
  const echeance =
    c.type === "TONTINE"
      ? libelleEcheance(c.frequence, c.jourEcheance)
      : c.dateLimite && `avant le ${formaterDate(c.dateLimite)}`;

  return (
    <Link href={`/caisses/${c.id}`} className={LIGNE}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 font-semibold">{c.nom}</span>
        <span className="text-xs text-muted-foreground">
          <Pastille ton="info" className="mr-1.5 px-2 py-0.5">{LIBELLES_TYPE[c.type]}</Pastille>
          {c._count.membres} membre{c._count.membres > 1 ? "s" : ""}
          {echeance ? ` · ${echeance}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-1 text-sm font-semibold">
        {formaterFCFA(c.montantCotisation)}
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </Link>
  );
}
