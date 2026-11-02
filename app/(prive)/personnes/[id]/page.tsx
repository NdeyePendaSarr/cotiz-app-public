import { ChevronRight, MessageCircle, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EnTete } from "@/components/cotiz/en-tete";
import { GrilleHistorique } from "@/components/cotiz/graphiques";
import { PastilleStatut } from "@/components/cotiz/pastille";
import { Bloc, LIGNE, Section } from "@/components/cotiz/section";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { buttonVariants } from "@/components/ui/button";
import { exigerUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { obtenirPersonne, situationPersonne } from "@/lib/donnees/personnes";
import { historiquePersonne, verseDepuis } from "@/lib/donnees/suivi";
import { statutEcheance } from "@/lib/echeances/statut";
import { formaterDateHeure, formaterFCFA, LIBELLES_CANAL, LIBELLES_TYPE } from "@/lib/format";
import { construireHistorique } from "@/lib/suivi/historique";
import { formaterTelephone } from "@/lib/telephone";
import { cn } from "@/lib/utils";
import { schemaIdentifiant } from "@/lib/validation/caisse";

export const metadata: Metadata = { title: "Personne · Cotiz" };

const STATUTS_PAIEMENT = { A_RAPPROCHER: "à rapprocher", RAPPROCHE: "rapproché", IGNORE: "ignoré" } as const;

// Fiche d'une personne en lecture (audit, lot 2) : contact, situation dans chaque caisse,
// cycle par cycle (lot 4), derniers paiements. La modification passe par un bouton (pas de changement par erreur).
export default function PagePersonne({ params }: PageProps<"/personnes/[id]">) {
  return (
    <Suspense fallback={<><EnTete retour={{ href: "/personnes", libelle: "Personnes" }} titre="…" /><SqueletteListe /></>}>
      <FichePersonne params={params} />
    </Suspense>
  );
}

async function FichePersonne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  const personne = idValide.success ? await obtenirPersonne(ownerId, idValide.data) : null;
  if (!personne) notFound();
  const annee = aujourdhui().getUTCFullYear();
  const [{ parMembre, paiements }, entrees, verse] = await Promise.all([
    situationPersonne(ownerId, personne.id),
    historiquePersonne(ownerId, personne.id),
    verseDepuis(ownerId, personne.id, new Date(Date.UTC(annee, 0, 1))),
  ]);
  // Une grille par caisse : les numéros de cycle d'une caisse ne correspondent pas à ceux d'une autre.
  const parCaisse = [...new Set(entrees.map((e) => e.ligneId))].map((caisseId) => construireHistorique(entrees.filter((e) => e.ligneId === caisseId)));

  return (
    <>
      <EnTete retour={{ href: "/personnes", libelle: "Personnes" }} titre={personne.nomComplet} surtitre={personne.cellule ? `Cellule ${personne.cellule}` : undefined}>
        <p className="mt-2 text-sm text-nuit-doux">Versé en {annee}</p>
        <p className="font-heading text-3xl font-bold tracking-tight">{formaterFCFA(verse)}</p>
        <Link
          href={`/personnes/${personne.id}/modifier`}
          className={cn(buttonVariants({ variant: "secondary" }), "mt-3 w-fit bg-primary-foreground text-base text-primary hover:bg-primary-foreground/90")}
        >
          <Pencil aria-hidden />
          Modifier
        </Link>
      </EnTete>

      <Section titre="Contact">
        <Bloc>
          {personne.numeros.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Aucun numéro. Ajoute-le avec « Modifier » pour pouvoir relancer par WhatsApp.</p>
          ) : (
            personne.numeros.map((n) => (
              <a key={n.id} href={`https://wa.me/221${n.numero}`} target="_blank" rel="noopener noreferrer" className={LIGNE}>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums">{formaterTelephone(n.numero)}</span>
                  {n.libelle && <span className="text-xs text-muted-foreground">{n.libelle}</span>}
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                  <MessageCircle aria-hidden className="size-4" />
                  WhatsApp
                </span>
              </a>
            ))
          )}
          {personne.aliasWave.length > 0 && <p className="py-3 text-xs text-muted-foreground">Nom(s) dans les SMS Wave : {personne.aliasWave.join(", ")}</p>}
        </Bloc>
      </Section>

      <Section titre="Caisses">
        {personne.membres.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dans aucune caisse.</p>
        ) : (
          <Bloc>
            {personne.membres.map((m) => {
              const echeance = parMembre.get(m.id);
              const statut = echeance ? statutEcheance(echeance.montantDu, echeance.paye) : null;
              const reste = echeance ? Math.max(0, echeance.montantDu - echeance.paye) : 0;
              return (
                <Link key={m.id} href={`/caisses/${m.caisse.id}`} className={LIGNE}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold">{m.caisse.nom}</span>
                    <span className="text-xs text-muted-foreground">
                      {LIBELLES_TYPE[m.caisse.type]}
                      {m.ordrePassage !== null && ` · ordre ${m.ordrePassage}`}
                      {m.statut === "INACTIF" && " · membre retiré"}
                      {m.caisse.statut === "ARCHIVEE" && " · caisse archivée"}
                    </span>
                    {statut && reste > 0 && <span className="text-sm font-bold text-retard">Reste {formaterFCFA(reste)}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {statut && <PastilleStatut statut={statut} />}
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              );
            })}
          </Bloc>
        )}
      </Section>

      {parCaisse.length > 0 && (
        <Section titre="Cycle par cycle">
          <Bloc className="flex flex-col gap-1 py-4">
            {parCaisse.map((h, i) => (
              <GrilleHistorique key={h.lignes[0]?.ligneId} entete="Caisse" cycles={h.cycles} lignes={h.lignes} legende={i === parCaisse.length - 1} />
            ))}
          </Bloc>
        </Section>
      )}

      <Section titre="Derniers paiements">
        {paiements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
        ) : (
          <Bloc>
            {paiements.map((p) => (
              <Link key={p.id} href={`/paiements/${p.id}`} className={LIGNE}>
                <span className="flex flex-col">
                  <span className="font-semibold">{formaterFCFA(p.montant)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formaterDateHeure(p.dateReception)} · {LIBELLES_CANAL[p.canal]} · {STATUTS_PAIEMENT[p.statut]}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </Bloc>
        )}
      </Section>
    </>
  );
}
