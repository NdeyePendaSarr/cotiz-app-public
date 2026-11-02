import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { Suspense } from "react";
import { CopyX, HandHeart } from "lucide-react";
import { garderCommeDon } from "@/app/actions/dons";
import { ignorerDoublons, marquerRembourse } from "@/app/actions/remboursement";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { Button } from "@/components/ui/button";
import { exigerUtilisatrice } from "@/lib/auth";
import { excedentsARembourser, payeesParImport } from "@/lib/donnees/suivi";
import { prisma } from "@/lib/prisma";
import { formaterFCFA } from "@/lib/format";
import { CartePaiement } from "../capture/carte-paiement";

export const metadata: Metadata = { title: "À rembourser · Cotiz" };

// Un excédent n'est jamais avancé sur un cycle suivant (cahier) : il est rendu, puis marqué ici.
export default function PageARembourser() {
  return (
    <>
      <EnTete titre="À rembourser">
        <p className="text-sm text-nuit-doux">
          Paiements dont une partie n&apos;a servi à aucune cotisation : à rendre, ou à garder comme bonne volonté dans une collecte.
        </p>
      </EnTete>
      <Suspense fallback={<SqueletteListe />}>
        <Liste />
      </Suspense>
    </>
  );
}

async function Liste() {
  const { id: ownerId } = await exigerUtilisatrice();
  const excedents = await excedentsARembourser(ownerId);
  if (excedents.length === 0) return <p className="text-muted-foreground">Rien à rembourser.</p>;

  // Doublons de l'import : SMS validé pour une personne déjà payée par la colonne « Versé ».
  const personneIds = [...new Set(excedents.flatMap((p) => (p.sansRepartition && p.personneId ? [p.personneId] : [])))];
  const repris = personneIds.length > 0 ? await payeesParImport(prisma, ownerId, personneIds) : {};
  const montantRepris = (p: (typeof excedents)[number]) => (p.sansRepartition && p.personneId ? repris[p.personneId] : undefined);
  const doublons = excedents.filter((p) => montantRepris(p));

  const total = excedents.reduce((s, p) => s + p.excedent, 0);
  return (
    <>
      <p className="font-medium">Total : {formaterFCFA(total)}</p>
      {doublons.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-avertissement/10 p-4 ring-1 ring-avertissement/30">
          <h2 className="text-base font-semibold">
            {doublons.length} doublon{doublons.length > 1 ? "s" : ""} probable{doublons.length > 1 ? "s" : ""} de la liste importée
          </h2>
          <p className="text-sm">
            Ces personnes étaient déjà payées par la colonne « Versé » de ta liste : le SMS est sûrement le même argent. L&apos;ignorer le
            retire des comptes (c&apos;est réversible, depuis « Rapprocher », « Paiements ignorés »).
          </p>
          <form action={ignorerDoublons}>
            {doublons.map((p) => (
              <input key={p.id} type="hidden" name="paiementId" value={p.id} />
            ))}
            <Button type="submit" className="mt-1 h-auto min-h-12 w-full bg-or text-base whitespace-normal text-or-foreground hover:bg-or/90">
              <CopyX aria-hidden />
              Ignorer {doublons.length > 1 ? `les ${doublons.length} doublons` : "ce doublon"} · {formaterFCFA(doublons.reduce((s, p) => s + p.excedent, 0))}
            </Button>
          </form>
        </section>
      )}
      <ul className="flex flex-col gap-3">
        {excedents.map((p) => (
          <li key={p.id}>
            <CartePaiement paiement={{ ...p, dateReception: p.dateReception.toISOString(), personne: p.personne?.nomComplet ?? null }} lienHistorique>
              <span className="font-semibold text-avertissement">À rembourser : {formaterFCFA(p.excedent)}</span>
              {montantRepris(p) && (
                <>
                  <span className="text-sm">
                    Déjà payée par la liste importée ({formaterFCFA(montantRepris(p)!)}) : sûrement le même argent.
                  </span>
                  <form action={ignorerDoublons}>
                    <input type="hidden" name="paiementId" value={p.id} />
                    <Button type="submit" variant="outline" className="mt-1 h-11 w-full text-base">
                      <CopyX aria-hidden />
                      Ignorer, c&apos;est le même argent
                    </Button>
                  </form>
                </>
              )}
              {/* Collecte : le surplus peut rester dans la caisse, comme une bonne volonté. */}
              {p.collecte && (
                <form action={garderCommeDon}>
                  <input type="hidden" name="paiementId" value={p.id} />
                  <Button type="submit" className="mt-1 h-auto min-h-11 w-full text-base whitespace-normal">
                    <HandHeart aria-hidden />
                    Garder comme bonne volonté ({p.collecte.nom})
                  </Button>
                </form>
              )}
              <form action={marquerRembourse}>
                <input type="hidden" name="paiementId" value={p.id} />
                <Button type="submit" variant="outline" className="mt-1 h-11 w-full text-base">
                  Marquer remboursé
                </Button>
              </form>
            </CartePaiement>
          </li>
        ))}
      </ul>
    </>
  );
}
