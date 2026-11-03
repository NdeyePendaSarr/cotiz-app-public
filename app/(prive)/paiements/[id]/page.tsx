import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { annulerRapprochement } from "@/app/actions/rapprochement";
import { Button } from "@/components/ui/button";
import { exigerUtilisatrice } from "@/lib/auth";
import { historiquePaiement } from "@/lib/donnees/paiements";
import { excedentPaiement } from "@/lib/dons";
import { formaterDate, formaterDateHeure, formaterFCFA } from "@/lib/format";
import { decrireLigne } from "@/lib/historique";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { CartePaiement } from "../../capture/carte-paiement";

export const metadata: Metadata = { title: "Paiement · Cotiz" };

const STATUTS = { A_RAPPROCHER: "À rapprocher", RAPPROCHE: "Rapproché", IGNORE: "Ignoré" } as const;

// Historique d'un paiement (cahier, phase 9) : son état actuel, sa répartition, puis chaque
// ligne du journal d'audit qui le concerne, de la plus ancienne à la plus récente.
export default function PagePaiement({ params }: PageProps<"/paiements/[id]">) {
  return (
    <>
      <Suspense fallback={<><EnTete retour={{ href: "/capture", libelle: "Capture" }} titre="…" /><SqueletteListe /></>}>
        <DetailPaiement params={params} />
      </Suspense>
    </>
  );
}

async function DetailPaiement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const historique = idValide.success ? await historiquePaiement(ownerId, idValide.data) : null;
  if (!historique) notFound();

  const { paiement: p, journal, libellesEcheances } = historique;
  const excedent = p.statut === "RAPPROCHE" ? excedentPaiement(p.montant, p.allocations, p.don, p.mouvementCompte) : 0;

  return (
    <>
      <EnTete retour={{ href: "/capture", libelle: "Capture" }} titre="Paiement" />
      <CartePaiement paiement={{ ...p, dateReception: p.dateReception.toISOString(), personne: p.personne?.nomComplet ?? null }}>
        <span className="text-sm font-medium">{STATUTS[p.statut]}</span>
        {p.note && <span className="text-sm text-muted-foreground">Note : {p.note}</span>}
      </CartePaiement>

      {p.allocations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-base font-semibold">Répartition</h2>
          <ul className="flex flex-col gap-1">
            {p.allocations.map((a, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  <Link href={`/caisses/${a.echeance.cycle.caisse.id}`} className="underline underline-offset-4">
                    {a.echeance.cycle.caisse.nom}
                  </Link>
                  <span className="text-muted-foreground">, cycle {a.echeance.cycle.numero} ({formaterDate(a.echeance.cycle.dateEcheance)})</span>
                </span>
                <span className="shrink-0">{formaterFCFA(a.montant)}</span>
              </li>
            ))}
          </ul>
          {p.don && (
            <p className="flex justify-between gap-2">
              <Link href={`/caisses/${p.don.caisseId}/dons/${p.don.id}`} className="underline underline-offset-4">
                Bonne volonté
              </Link>
              <span className="shrink-0 text-paye">{formaterFCFA(p.don.montant)}</span>
            </p>
          )}
          {excedent > 0 && (
            <p className="text-sm text-avertissement">
              Excédent : {formaterFCFA(excedent)}
              {p.rembourseLe ? `, remboursé le ${formaterDate(p.rembourseLe)}` : ", à rembourser"}
            </p>
          )}
        </section>
      )}

      {p.mouvementCompte && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-base font-semibold">Compte gardé</h2>
          <p className="flex justify-between gap-2">
            <Link href={`/caisses/${p.mouvementCompte.caisse.id}`} className="underline underline-offset-4">
              {p.mouvementCompte.caisse.nom}
            </Link>
            <span className="shrink-0 text-paye">+{formaterFCFA(p.mouvementCompte.montant)}</span>
          </p>
          {p.statut === "RAPPROCHE" && (
            // Seul moyen de corriger ce versement : le paiement redevient « à rapprocher », le versement disparaît.
            <form action={annulerRapprochement}>
              <input type="hidden" name="paiementId" value={p.id} />
              <Button type="submit" variant="outline" className="h-11 w-full text-base">
                Annuler le versement sur le compte
              </Button>
            </form>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold">Historique</h2>
        {journal.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune ligne dans le journal.</p>
        ) : (
          <ol className="flex flex-col gap-2 border-l-2 border-foreground/10 pl-3">
            {journal.map((l) => (
              <li key={String(l.id)} className="flex flex-col">
                <span>{decrireLigne(l, libellesEcheances)}</span>
                <span className="text-xs text-muted-foreground">{formaterDateHeure(l.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {p.texteBrut && (
        <details>
          <summary className="flex h-11 cursor-pointer items-center text-muted-foreground">Texte du SMS</summary>
          <p className="whitespace-pre-wrap rounded-2xl bg-muted p-3 text-sm">{p.texteBrut}</p>
        </details>
      )}
    </>
  );
}
