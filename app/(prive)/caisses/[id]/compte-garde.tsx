import { BoutonEnvoi } from "@/components/cotiz/bouton-envoi";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { changerStatutCaisse } from "@/app/actions/caisses";
import { EnTete } from "@/components/cotiz/en-tete";
import { CourbeSolde } from "@/components/cotiz/graphiques";
import { Bloc, Section } from "@/components/cotiz/section";
import { TABLEAU } from "@/components/cotiz/styles";
import { buttonVariants } from "@/components/ui/button";
import { courbeSolde, LIBELLES_SENS, soldeCompte } from "@/lib/comptes";
import { obtenirCompte } from "@/lib/donnees/comptes";
import { formaterDate, formaterFCFA, LIBELLES_CANAL } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";
import { cn } from "@/lib/utils";

// Compte gardé (argent gardé pour une personne) : pas de cycle ni d'échéance, des versements et des
// retraits, et un solde courant qui peut devenir négatif (avance faite au titulaire).

const RETOUR = { href: "/caisses", libelle: "Caisses" };

export async function CompteGarde({ ownerId, caisseId, vue, selecteur }: { ownerId: string; caisseId: string; vue: string | undefined; selecteur: React.ReactNode }) {
  const compte = await obtenirCompte(ownerId, caisseId);
  if (!compte) notFound();
  const archive = compte.statut === "ARCHIVEE";
  const titulaire = compte.membres[0]?.personne ?? null;
  const { verse, retire, solde, nombre } = soldeCompte(compte.mouvements);
  const courbe = courbeSolde(compte.mouvements);
  const onglet = vue === "caisse" ? "caisse" : "mouvements";
  const lienMouvement = (m: { id: string; paiementId: string | null }) =>
    m.paiementId ? `/paiements/${m.paiementId}` : `/caisses/${compte.id}/mouvements/${m.id}`;

  return (
    <>
      <EnTete
        action={selecteur}
        retour={RETOUR}
        titre={compte.nom}
        surtitre={`Compte gardé${titulaire ? ` pour ${titulaire.nomComplet}` : ""}${archive ? " · archivé" : ""}`}
        montant={formaterFCFA(solde)}
        chiffres={[
          { libelle: solde < 0 ? "Solde (avance)" : "Solde", valeur: formaterFCFA(solde), detail: "gardé aujourd'hui", accent: true, alerte: solde < 0 },
          { libelle: "Versé", valeur: formaterFCFA(verse), detail: "depuis le début" },
          { libelle: "Retiré", valeur: formaterFCFA(retire), detail: "depuis le début" },
          { libelle: "Mouvements", valeur: String(nombre) },
        ]}
      >
        <p className="text-sm text-nuit-doux lg:hidden">
          {solde < 0 ? "avancé en plus de ce qu'il a versé" : "gardé aujourd'hui"} · versé {formaterFCFA(verse)}, retiré {formaterFCFA(retire)}
        </p>
        {!archive && (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:w-fit">
            <Link href={`/caisses/${compte.id}/mouvements/nouveau?sens=VERSEMENT`} className={cn(buttonVariants({ variant: "secondary" }), "h-11 bg-primary-foreground text-base text-primary hover:bg-primary-foreground/90")}>
              <Plus aria-hidden className="size-4" />
              Versement
            </Link>
            <Link href={`/caisses/${compte.id}/mouvements/nouveau?sens=RETRAIT`} className={cn(buttonVariants({ variant: "secondary" }), "h-11 bg-primary-foreground text-base text-primary hover:bg-primary-foreground/90")}>
              <Minus aria-hidden className="size-4" />
              Retrait
            </Link>
          </div>
        )}
        {selecteur && <div className="lg:hidden">{selecteur}</div>}
      </EnTete>

      <nav aria-label="Sections du compte" data-pleine-largeur className="sticky top-0 z-[5] -mx-4 bg-background/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
        <ul className="flex gap-1 border-b border-border">
          {[
            { cle: "mouvements", libelle: nombre > 0 ? `Mouvements (${nombre})` : "Mouvements", href: `/caisses/${compte.id}` },
            { cle: "caisse", libelle: "Compte", href: `/caisses/${compte.id}?vue=caisse` },
          ].map((o) => (
            <li key={o.cle} className="flex-1">
              <Link
                href={o.href}
                scroll={false}
                aria-current={onglet === o.cle ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-12 items-center justify-center border-b-2 text-sm font-bold",
                  onglet === o.cle ? "border-primary text-primary" : "border-transparent text-muted-foreground",
                )}
              >
                {o.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {onglet === "mouvements" && (
        <Section titre="Versements et retraits">
          <Bloc>
            {courbe.length > 1 && (
              <div className="py-4">
                <CourbeSolde points={courbe} libelle="Solde du compte, jour après jour" />
              </div>
            )}
            {nombre === 0 ? (
              <div className="flex flex-col gap-3 py-3">
                <p className="text-sm text-muted-foreground">Aucun mouvement pour l&apos;instant.</p>
                {!archive && (
                  <Link href={`/caisses/${compte.id}/importer`} className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}>
                    Reprendre l&apos;historique (Word, Excel)
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="divide-y divide-border lg:hidden">
                  {compte.mouvements.map((m) => (
                    <Link key={m.id} href={lienMouvement(m)} className="flex min-h-14 items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold">{LIBELLES_SENS[m.sens]}</span>
                        <span className="text-xs text-muted-foreground">
                          {formaterDate(m.date)} · {LIBELLES_CANAL[m.canal]}
                          {m.paiementId && " · paiement rapproché"}
                          {m.note && ` · ${m.note}`}
                        </span>
                      </span>
                      <Montant sens={m.sens} montant={m.montant} />
                    </Link>
                  ))}
                </div>
                <table className={cn(TABLEAU.table, "hidden lg:table")}>
                  <thead className={TABLEAU.entete}>
                    <tr>
                      <th scope="col" className={TABLEAU.colonne}>Date</th>
                      <th scope="col" className={TABLEAU.colonne}>Mouvement</th>
                      <th scope="col" className={TABLEAU.colonne}>Canal</th>
                      <th scope="col" className={TABLEAU.colonne}>Note</th>
                      <th scope="col" className={cn(TABLEAU.colonne, "pr-0 text-right")}>Montant</th>
                    </tr>
                  </thead>
                  <tbody className={TABLEAU.corps}>
                    {compte.mouvements.map((m) => (
                      <tr key={m.id} className={TABLEAU.ligne}>
                        <td className="pr-3 whitespace-nowrap text-muted-foreground">{formaterDate(m.date)}</td>
                        <td className="pr-3 font-semibold">
                          <Link href={lienMouvement(m)} className="after:absolute after:inset-0">
                            {LIBELLES_SENS[m.sens]}
                          </Link>
                          {m.paiementId && <span className="ml-2 text-xs font-normal text-muted-foreground">paiement rapproché</span>}
                        </td>
                        <td className="pr-3">{LIBELLES_CANAL[m.canal]}</td>
                        <td className="pr-3 text-muted-foreground">{m.note ?? "–"}</td>
                        <td className="text-right whitespace-nowrap tabular-nums">
                          <Montant sens={m.sens} montant={m.montant} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bloc>
        </Section>
      )}

      {onglet === "caisse" && (
        <Section titre="Le compte">
          <Bloc>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-3 text-sm">
              <dt className="text-muted-foreground">Pour</dt>
              <dd className="text-right font-semibold">
                {titulaire ? (
                  <Link href={`/personnes/${titulaire.id}`} className="text-primary">
                    {titulaire.nomComplet}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              {titulaire?.numeros[0] && (
                <>
                  <dt className="text-muted-foreground">Numéro</dt>
                  <dd className="text-right font-semibold">{formaterTelephone(titulaire.numeros[0].numero)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Ouvert le</dt>
              <dd className="text-right font-semibold">{formaterDate(compte.createdAt)}</dd>
            </dl>
            <p className="pb-3 text-sm text-muted-foreground">
              Un SMS Wave reçu de son numéro peut être versé sur ce compte au moment du rapprochement.
            </p>
            {!archive && (
              <Link href={`/caisses/${compte.id}/importer`} className={cn(buttonVariants({ variant: "outline" }), "mb-2 h-11 w-full text-base")}>
                Reprendre l&apos;historique (Word, Excel)
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2 py-3">
              <Link href={`/caisses/${compte.id}/modifier`} className={cn(buttonVariants({ variant: "outline" }), "text-base")}>
                Renommer
              </Link>
              <form action={changerStatutCaisse}>
                <input type="hidden" name="id" value={compte.id} />
                <input type="hidden" name="statut" value={archive ? "ACTIVE" : "ARCHIVEE"} />
                <BoutonEnvoi variant="outline" className="w-full text-base">
                  {archive ? "Réactiver" : "Archiver"}
                </BoutonEnvoi>
              </form>
            </div>
          </Bloc>
        </Section>
      )}
    </>
  );
}

function Montant({ sens, montant }: { sens: "VERSEMENT" | "RETRAIT"; montant: number }) {
  return sens === "VERSEMENT" ? (
    <span className="shrink-0 font-semibold text-paye">+{formaterFCFA(montant)}</span>
  ) : (
    <span className="shrink-0 font-semibold">−{formaterFCFA(montant)}</span>
  );
}
