import { BoutonEnvoi } from "@/components/cotiz/bouton-envoi";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { changerStatutCaisse } from "@/app/actions/caisses";
import { creerCycleCollecte, ouvrirPremierCycle } from "@/app/actions/cycles";
import { changerStatutMembre } from "@/app/actions/membres";
import { EnTete, Progression } from "@/components/cotiz/en-tete";
import { Bloc, Section } from "@/components/cotiz/section";
import { CasesChiffres } from "@/components/cotiz/cases-chiffres";
import { Anneau, BarresHorizontales, Cascade, GrilleHistorique, GrilleMois, JaugeRythme } from "@/components/cotiz/graphiques";
import { TABLEAU } from "@/components/cotiz/styles";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { buttonVariants } from "@/components/ui/button";
import { exigerUtilisatrice } from "@/lib/auth";
import { ajouterJours, aujourdhui, prochaineEcheance } from "@/lib/cycles/dates";
import { obtenirCaisse } from "@/lib/donnees/caisses";
import { compterCycles } from "@/lib/donnees/cycles";
import { listerMembres } from "@/lib/donnees/membres";
import { avecDepenses, bilanCaisse, donsParDonateur, LIBELLES_CATEGORIE } from "@/lib/depenses";
import { construireGrilleMois, enrichirMensualite, moisEnCours, montantDuParMembre } from "@/lib/mensualite";
import { encaisseCaisse, listerDepenses, listerDons } from "@/lib/donnees/depenses";
import { formaterDate, formaterFCFA, libelleEcheance, LIBELLES_CANAL, LIBELLES_FREQUENCE, LIBELLES_TYPE, versChampDate } from "@/lib/format";
import { formaterTelephone } from "@/lib/telephone";
import { schemaIdentifiant } from "@/lib/validation/caisse";
import { cn } from "@/lib/utils";
import { plusPetitOrdreLibre } from "@/lib/ordre";
import { historiqueCaisse, listerCaissesPourSelecteur, suiviCaisse } from "@/lib/donnees/suivi";
import { construireHistorique, MAX_CYCLES_HISTORIQUE } from "@/lib/suivi/historique";
import { calculerSuivi } from "@/lib/suivi/cycle";
import { rythmeCollectes } from "@/lib/statistiques";
import { FormulaireOuvertureCycle } from "./formulaire-cycle";
import { CompteGarde } from "./compte-garde";
import { SelecteurCaisse } from "./selecteur-caisse";
import { Cloture, SuiviCaisse, type ContexteSuivi } from "./suivi-caisse";
import { FormulaireEchange } from "./formulaire-echange";
import { FormulaireOrdre } from "./formulaire-ordre";

export const metadata: Metadata = { title: "Caisse · Cotiz" };

// params est une promesse (Next 16) : on la passe telle quelle au composant sous <Suspense>.
// ?vue=membres | historique | dons | depenses | caisse : l'onglet affiché (audit, lot 1) ; Membres par défaut.
export default function PageCaisse({ params, searchParams }: PageProps<"/caisses/[id]">) {
  return (
    <Suspense fallback={<><EnTete titre="Caisse" retour={RETOUR} /><SqueletteListe /></>}>
      <DetailCaisse params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Vue = "membres" | "mois" | "historique" | "dons" | "depenses" | "caisse";

const RETOUR = { href: "/caisses", libelle: "Caisses" };

async function DetailCaisse({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { vue: vueDemandee }] = await Promise.all([params, searchParams]);
  const { id: ownerId } = await exigerUtilisatrice();
  const idValide = schemaIdentifiant.safeParse(id);
  if (!idValide.success) notFound();
  // Lectures lancées EN MÊME TEMPS que celle de la caisse (audit, lot 3) : toutes sont filtrées par
  // ownerId, une caisse d'une autre utilisatrice ne renvoie donc rien, et la page s'arrête juste après.
  const [caisse, caisses, donnees, nbCycles, historiqueLu] = await Promise.all([
    obtenirCaisse(ownerId, idValide.data),
    listerCaissesPourSelecteur(ownerId),
    suiviCaisse(ownerId, idValide.data),
    compterCycles(ownerId, idValide.data),
    // Historique (lot 4, tontines) : lu seulement quand l'onglet est ouvert.
    vueDemandee === "historique" ? historiqueCaisse(ownerId, idValide.data) : [],
  ]);
  if (!caisse) notFound(); // même réponse pour « n'existe pas » et « pas à toi »
  // Compte gardé : ni cycle ni membres à suivre, sa propre page (solde, versements, retraits).
  if (caisse.type === "COMPTE_GARDE") {
    const selecteurCompte = caisses.length > 1 && <SelecteurCaisse caisseId={caisse.id} caisses={caisses} />;
    return <CompteGarde ownerId={ownerId} caisseId={caisse.id} vue={typeof vueDemandee === "string" ? vueDemandee : undefined} selecteur={selecteurCompte} />;
  }

  const archivee = caisse.statut === "ARCHIVEE";
  const collecte = caisse.type === "COLLECTE";
  const mensualite = caisse.type === "MENSUALITE";
  // Collectes et mensualités : dépenses, bonnes volontés et restant en caisse.
  const sorties = avecDepenses(caisse.type);
  const entreesHistorique = caisse.type === "TONTINE" ? historiqueLu : [];
  const [depenses, encaisse, dons] = await Promise.all([
    sorties ? listerDepenses(ownerId, caisse.id) : [],
    sorties ? encaisseCaisse(ownerId, caisse.id) : 0,
    sorties ? listerDons(ownerId, caisse.id) : [],
  ]);
  // Sorties de caisse (phase 11, collectes) : cotisations + bonnes volontés − dépensé = restant.
  const bilan = sorties ? bilanCaisse(encaisse, depenses, dons.reduce((t, d) => t + d.montant, 0)) : null;
  const donateurs = donsParDonateur(dons);
  const nbDonateurs = new Set(dons.map((d) => d.donateur.trim().toLowerCase())).size;
  const jour = aujourdhui();
  // Suivi du cycle ouvert (ou du dernier cycle d'une collecte terminée).
  // Mensualité : « à jour », reste et relances portent sur ce qui est dû à ce jour, pas sur toute l'année.
  const lignesSuivi = donnees ? (mensualite ? enrichirMensualite(donnees.lignes, caisse, jour) : donnees.lignes) : [];
  const suivi = donnees ? calculerSuivi(lignesSuivi, donnees.cycle.dateEcheance, jour, donnees.totalArrieres) : null;
  const grilleMois = mensualite && donnees && caisse.moisDebut && caisse.nombreMois ? construireGrilleMois(donnees.lignes, caisse.montantCotisation, caisse.moisDebut, caisse.nombreMois, jour) : null;
  const numeroMois = mensualite && caisse.moisDebut && caisse.nombreMois ? moisEnCours(caisse.moisDebut, caisse.nombreMois, jour) : 0;
  const vues: { vue: Vue; libelle: string; court?: string; nombre?: number }[] = [
    { vue: "membres", libelle: "Membres", nombre: suivi?.actifs.length },
    ...(grilleMois ? [{ vue: "mois" as const, libelle: "Mois par mois", court: "Mois" }] : []),
    ...(caisse.type === "TONTINE" && nbCycles > 0 ? [{ vue: "historique" as const, libelle: "Historique" }] : []),
    ...(sorties
      ? [
          { vue: "dons" as const, libelle: "Bonnes volontés", court: "Dons", nombre: dons.length || undefined },
          { vue: "depenses" as const, libelle: "Dépenses", nombre: depenses.length || undefined },
        ]
      : []),
    { vue: "caisse", libelle: "Caisse" },
  ];
  const vue: Vue = vues.some((v) => v.vue === vueDemandee) ? (vueDemandee as Vue) : "membres";
  const contexte: ContexteSuivi | null =
    donnees && suivi
      ? {
          caisseId: caisse.id,
          caisseNom: caisse.nom,
          type: caisse.type,
          cycleNumero: donnees.cycle.numero,
          cycleOuvert: donnees.cycle.statut === "OUVERT" && !archivee,
          dateDebut: donnees.cycle.dateDebut.toISOString(),
          dateEcheance: donnees.cycle.dateEcheance.toISOString(),
          modeleRelance: caisse.modeleRelance,
          prochaineEcheance:
            caisse.type === "TONTINE"
              ? (prochaineEcheance(caisse.frequence, caisse.jourEcheance, ajouterJours(donnees.cycle.dateEcheance, 1))?.toISOString() ?? null)
              : null,
          dateLimitePassee: sorties && Boolean(caisse.dateLimite && caisse.dateLimite < jour),
          finances: bilan && { cotisations: bilan.cotisations, dons: bilan.dons, encaisse: bilan.encaisse, depense: bilan.depense, restant: bilan.restant },
        }
      : null;
  const echeance =
    caisse.type === "TONTINE"
      ? libelleEcheance(caisse.frequence, caisse.jourEcheance)
      : caisse.dateLimite && `avant le ${formaterDate(caisse.dateLimite)}`;

  // Anneau des statuts (lot 3) : sous le montant sur téléphone, à gauche des chiffres sur ordinateur.
  const anneauStatuts = (taille = 96) => suivi && (
    <div className="flex items-center gap-4">
      <Anneau
        taille={taille}
        epaisseur={16}
        libelle={`${suivi.totaux.payes} payés, ${suivi.totaux.partiels} partiels, ${suivi.totaux.enAttente} en attente`}
        segments={[
          { libelle: "Payés", valeur: suivi.totaux.payes, trait: "stroke-anneau-paye" },
          { libelle: "Partiels", valeur: suivi.totaux.partiels, trait: "stroke-anneau-partiel" },
          { libelle: "En attente", valeur: suivi.totaux.enAttente, trait: "stroke-anneau-attente" },
        ]}
      >
        <span className={cn("font-heading leading-none font-bold", taille < 96 ? "text-sm" : "text-lg")}>
          {suivi.totaux.payes}/{suivi.actifs.length}
        </span>
        <span className="text-xs text-nuit-doux">à jour</span>
      </Anneau>
      <ul className="flex flex-col gap-1.5 text-sm">
        {[
          { libelle: "Payés", nombre: suivi.totaux.payes, fond: "bg-anneau-paye" },
          { libelle: "Partiels", nombre: suivi.totaux.partiels, fond: "bg-anneau-partiel" },
          { libelle: "En attente", nombre: suivi.totaux.enAttente, fond: "bg-anneau-attente" },
        ].map((x) => (
          <li key={x.libelle} className="flex items-center gap-2 whitespace-nowrap">
            <span aria-hidden className={cn("size-2.5 rounded-[3px]", x.fond)} />
            {x.libelle}
            <span className="font-semibold">{x.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  // Rythme : collecte ouverte seulement (règle validée le 03/11/2026).
  const rythme =
    collecte && suivi && donnees && donnees.cycle.statut === "OUVERT" && !archivee
      ? rythmeCollectes([{ dateDebut: donnees.cycle.dateDebut, dateEcheance: donnees.cycle.dateEcheance, attendu: suivi.totaux.attendu, recu: suivi.totaux.recu }], jour)
      : null;
  const pourcentageRecu = suivi && suivi.totaux.attendu > 0 ? Math.round((suivi.totaux.recu / suivi.totaux.attendu) * 100) : 0;
  const selecteur = caisses.length > 1 && <SelecteurCaisse caisseId={caisse.id} caisses={caisses} />;
  const selecteurCompact = caisses.length > 1 && <SelecteurCaisse caisseId={caisse.id} caisses={caisses} compact />;

  return (
    <>
      <EnTete
        aCote={anneauStatuts()}
        action={selecteur}
        actionMobile={selecteurCompact}
        retour={RETOUR}
        titre={caisse.nom}
        surtitre={
          donnees
            ? mensualite && caisse.nombreMois
              ? `Mensualité · ${numeroMois === 0 ? "pas encore commencée" : numeroMois > caisse.nombreMois ? "terminée" : `mois ${numeroMois} sur ${caisse.nombreMois}`} · fin le ${formaterDate(donnees.cycle.dateEcheance)}`
              : `${caisse.type === "TONTINE" ? `Cycle ${donnees.cycle.numero}` : "Collecte"} · échéance ${formaterDate(donnees.cycle.dateEcheance)}`
            : `${LIBELLES_TYPE[caisse.type]}${archivee ? " · archivée" : ""}`
        }
        montant={formaterFCFA(suivi ? suivi.totaux.recu : caisse.montantCotisation)}
        chiffres={
          suivi
            ? [
                { libelle: "Reçu", valeur: formaterFCFA(suivi.totaux.recu), detail: `${pourcentageRecu} % de l'attendu` },
                ...(bilan
                  ? [
                      ...(bilan.dons > 0 ? [{ libelle: "Bonnes volontés", valeur: formaterFCFA(bilan.dons), detail: `${nbDonateurs} donateur${nbDonateurs > 1 ? "s" : ""}` }] : []),
                      { libelle: "Encaissé", valeur: formaterFCFA(bilan.encaisse), detail: bilan.dons > 0 ? "cotisations + dons" : "cotisations" },
                      { libelle: "Dépensé", valeur: formaterFCFA(bilan.depense), detail: `${depenses.length} dépense${depenses.length > 1 ? "s" : ""}` },
                      {
                        libelle: bilan.depassement ? "Restant (dépassement)" : "Restant",
                        valeur: formaterFCFA(bilan.restant),
                        detail: "en caisse",
                        accent: true,
                        alerte: bilan.depassement,
                      },
                    ]
                  : [
                      { libelle: "Attendu", valeur: formaterFCFA(suivi.totaux.attendu), detail: `cycle ${donnees?.cycle.numero ?? ""}` },
                      { libelle: "Reste à recevoir", valeur: formaterFCFA(Math.max(0, suivi.totaux.attendu - suivi.totaux.recu)) },
                      { libelle: "Membres à jour", valeur: `${suivi.totaux.payes} / ${suivi.actifs.length}` },
                    ]),
              ]
            : undefined
        }
      >
        {suivi ? (
          <>
            {/* Sur ordinateur, ces deux chiffres sont dans les cases du bandeau. */}
            <p className="text-sm text-nuit-doux lg:hidden">
              sur {formaterFCFA(suivi.totaux.attendu)} attendus{archivee && " · caisse archivée"}
            </p>
            {/* Ordinateur : la part reçue est écrite sous « Reçu ». Collecte ouverte : la jauge de rythme la montre déjà. */}
            <Progression valeur={suivi.totaux.recu} total={suivi.totaux.attendu} libelle="Part reçue sur ce cycle" className={rythme ? "hidden" : "lg:hidden"} />
            <div className="mt-3 lg:hidden">{anneauStatuts(88)}</div>
          </>
        ) : (
          <p className="text-sm text-nuit-doux">par membre{echeance ? `, ${echeance}` : ""}</p>
        )}
        {rythme && (
          <div className="mt-4">
            <JaugeRythme rythme={rythme} />
          </div>
        )}
      </EnTete>

      {/* Téléphone : l'argent de la collecte sur une ligne, sous le bandeau (sur ordinateur, il est dans le bandeau). */}
      {suivi && bilan && (bilan.depense > 0 || bilan.dons > 0) && (
        <p className={cn("-mt-2 text-sm text-muted-foreground lg:hidden", bilan.depassement && "font-semibold text-retard")}>
          Restant en caisse <span className="font-semibold text-foreground">{formaterFCFA(bilan.restant)}</span>
          {bilan.depassement && " (dépassement)"}
          {bilan.dons > 0 && ` · dons ${formaterFCFA(bilan.dons)}`}
        </p>
      )}

      {/* Onglets (audit, lot 1) : la liste des membres ne repousse plus dépenses et réglages tout en bas. */}
      <nav aria-label="Sections de la caisse" data-pleine-largeur className="sticky top-0 z-[5] -mx-4 bg-background/95 px-4 backdrop-blur lg:mx-0 lg:px-0">
        <ul className="flex overflow-x-auto border-b border-border [scrollbar-width:none]">
          {vues.map((v) => (
            <li key={v.vue} className="shrink-0 lg:flex-1">
              <Link
                href={v.vue === "membres" ? `/caisses/${caisse.id}` : `/caisses/${caisse.id}?vue=${v.vue}`}
                scroll={false}
                aria-current={vue === v.vue ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-12 items-center justify-center gap-1.5 border-b-2 px-2.5 text-sm font-bold whitespace-nowrap lg:px-3",
                  vue === v.vue ? "border-primary text-primary" : "border-transparent text-muted-foreground",
                )}
              >
                {v.court ? (
                  <>
                    <span className="lg:hidden">{v.court}</span>
                    <span className="hidden lg:inline">{v.libelle}</span>
                  </>
                ) : (
                  v.libelle
                )}
                {v.nombre !== undefined && <span className="font-medium opacity-70">{v.nombre}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {vue === "membres" &&
        (donnees && suivi && contexte ? (
          <>
            {donnees.cycle.statut !== "OUVERT" && sorties && (
              <p className="rounded-2xl bg-secondary p-3 text-center font-semibold text-secondary-foreground">{mensualite ? "Mensualité terminée." : "Collecte terminée."}</p>
            )}
            <SuiviCaisse suivi={suivi} contexte={contexte} />
          </>
        ) : archivee ? (
          <p className="text-muted-foreground">Caisse archivée.</p>
        ) : (
          <PremierCycle caisse={caisse} nbCycles={nbCycles} />
        ))}

      {vue === "mois" && grilleMois && (
        <Section titre="Mois par mois" pleineLargeur>
          <Bloc className="py-4">
            <GrilleMois mois={grilleMois.mois} lignes={grilleMois.lignes} />
          </Bloc>
          <p className="text-sm text-muted-foreground">
            Chaque versement couvre d&apos;abord les mois les plus anciens. Un mois est en retard quand il est terminé sans être payé.
          </p>
        </Section>
      )}

      {vue === "dons" && bilan && (
        <Section
          titre="Bonnes volontés"
          action={
            !archivee && (
              <Link href={`/caisses/${caisse.id}/dons/nouvelle`} className="flex h-11 items-center gap-1 text-sm font-semibold text-primary">
                <Plus aria-hidden className="size-4" />
                Ajouter
              </Link>
            )
          }
        >
          <p className="text-sm text-muted-foreground">
            Dons en plus des cotisations : ils comptent dans l&apos;encaissé et paient les dépenses comme les cotisations.
          </p>
          <Bloc>
            <CasesChiffres
              cases={[
                { libelle: "Cotisations", valeur: formaterFCFA(bilan.cotisations) },
                { libelle: "Bonnes volontés", valeur: formaterFCFA(bilan.dons), couleur: "text-paye" },
                { libelle: "Encaissé", valeur: formaterFCFA(bilan.encaisse) },
              ]}
            />
            {/* Qui a le plus donné (lot 3) : à partir de deux donateurs, les 4 premiers puis « autres ». */}
            {donateurs.length > 1 && (
              <div className="py-4">
                <BarresHorizontales libelle="Bonnes volontés par donateur" lignes={donateurs} />
              </div>
            )}
            {dons.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Aucune bonne volonté pour l&apos;instant.</p>
            ) : (
              <>
                <div className="divide-y divide-border lg:hidden">
                  {dons.map((d) => (
                    <Link key={d.id} href={`/caisses/${caisse.id}/dons/${d.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold">{d.donateur}</span>
                        <span className="text-xs text-muted-foreground">
                          {formaterDate(d.date)} · {LIBELLES_CANAL[d.canal]}
                          {d.remisPar && ` · remis à ${d.remisPar}`}
                          {d.note && ` · ${d.note}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-paye">+{formaterFCFA(d.montant)}</span>
                    </Link>
                  ))}
                </div>
                {/* Ordinateur : tableau ; toute la ligne ouvre la bonne volonté (lien étiré sur la ligne). */}
                <table className={cn(TABLEAU.table, "hidden lg:table")}>
                  <thead className={TABLEAU.entete}>
                    <tr>
                      <th scope="col" className={TABLEAU.colonne}>Date</th>
                      <th scope="col" className={TABLEAU.colonne}>De la part de</th>
                      <th scope="col" className={TABLEAU.colonne}>Remis à</th>
                      <th scope="col" className={TABLEAU.colonne}>Canal</th>
                      <th scope="col" className={TABLEAU.colonne}>Note</th>
                      <th scope="col" className={cn(TABLEAU.colonne, "pr-0 text-right")}>Montant</th>
                    </tr>
                  </thead>
                  <tbody className={TABLEAU.corps}>
                    {dons.map((d) => (
                      <tr key={d.id} className={TABLEAU.ligne}>
                        <td className="pr-3 whitespace-nowrap text-muted-foreground">{formaterDate(d.date)}</td>
                        <td className="pr-3 font-semibold">
                          <Link href={`/caisses/${caisse.id}/dons/${d.id}`} className="after:absolute after:inset-0">
                            {d.donateur}
                          </Link>
                        </td>
                        <td className="pr-3">{d.remisPar ?? <span className="text-muted-foreground">–</span>}</td>
                        <td className="pr-3">{LIBELLES_CANAL[d.canal]}</td>
                        <td className="pr-3 text-muted-foreground">{d.note ?? "–"}</td>
                        <td className="text-right font-semibold whitespace-nowrap text-paye tabular-nums">+{formaterFCFA(d.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bloc>
        </Section>
      )}

      {vue === "depenses" && bilan && (
        <Section
          titre="Dépenses"
          action={
            !archivee && (
              <Link href={`/caisses/${caisse.id}/depenses/nouvelle`} className="flex h-11 items-center gap-1 text-sm font-semibold text-primary">
                <Plus aria-hidden className="size-4" />
                Ajouter
              </Link>
            )
          }
        >
          <Bloc>
            <CasesChiffres
              cases={[
                {
                  libelle: "Encaissé",
                  valeur: formaterFCFA(bilan.encaisse),
                  detail: bilan.dons > 0 ? `dont ${formaterFCFA(bilan.dons)} de bonnes volontés` : undefined,
                },
                { libelle: "Dépensé", valeur: formaterFCFA(bilan.depense) },
                { libelle: "Restant", valeur: formaterFCFA(bilan.restant), couleur: bilan.depassement ? "text-retard" : "text-paye" },
              ]}
            />
            {bilan.depassement && <p className="py-2 text-sm font-semibold text-retard">Dépassement : plus de dépenses que de cotisations encaissées.</p>}
            {/* Cascade (lot 3) : d'où vient l'argent et où il est parti, catégorie par catégorie. */}
            {bilan.parCategorie.length > 0 && (
              <div className="py-4">
                <Cascade
                  libelle="Cotisations et bonnes volontés, moins les dépenses par catégorie : restant en caisse"
                  etapes={[
                    { libelle: "Cotisations", valeur: bilan.cotisations, genre: "entree" },
                    ...(bilan.dons > 0 ? [{ libelle: "Bonnes vol.", valeur: bilan.dons, genre: "don" as const }] : []),
                    ...bilan.parCategorie.map((c) => ({ libelle: LIBELLES_CATEGORIE[c.categorie], valeur: c.total, genre: "sortie" as const })),
                    { libelle: "Restant", valeur: bilan.restant, genre: "total" },
                  ]}
                />
              </div>
            )}
            {depenses.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Aucune dépense pour l&apos;instant.</p>
            ) : (
              <>
                <div className="divide-y divide-border lg:hidden">
                  {depenses.map((d) => (
                    <Link key={d.id} href={`/caisses/${caisse.id}/depenses/${d.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold">{d.motif}</span>
                        <span className="text-xs text-muted-foreground">
                          {formaterDate(d.date)} · {LIBELLES_CATEGORIE[d.categorie]} · {LIBELLES_CANAL[d.canal]}
                          {d.beneficiaire && ` · remis à ${d.beneficiaire}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">−{formaterFCFA(d.montant)}</span>
                    </Link>
                  ))}
                </div>
                {/* Ordinateur : tableau ; toute la ligne ouvre la dépense (lien étiré sur la ligne). */}
                <table className={cn(TABLEAU.table, "hidden lg:table")}>
                  <thead className={TABLEAU.entete}>
                    <tr>
                      <th scope="col" className={TABLEAU.colonne}>Date</th>
                      <th scope="col" className={TABLEAU.colonne}>Motif</th>
                      <th scope="col" className={TABLEAU.colonne}>Catégorie</th>
                      <th scope="col" className={TABLEAU.colonne}>Canal</th>
                      <th scope="col" className={TABLEAU.colonne}>Remis à</th>
                      <th scope="col" className={cn(TABLEAU.colonne, "pr-0 text-right")}>Montant</th>
                    </tr>
                  </thead>
                  <tbody className={TABLEAU.corps}>
                    {depenses.map((d) => (
                      <tr key={d.id} className={TABLEAU.ligne}>
                        <td className="pr-3 whitespace-nowrap text-muted-foreground">{formaterDate(d.date)}</td>
                        <td className="pr-3 font-semibold">
                          <Link href={`/caisses/${caisse.id}/depenses/${d.id}`} className="after:absolute after:inset-0">
                            {d.motif}
                          </Link>
                        </td>
                        <td className="pr-3">{LIBELLES_CATEGORIE[d.categorie]}</td>
                        <td className="pr-3">{LIBELLES_CANAL[d.canal]}</td>
                        <td className="pr-3 text-muted-foreground">{d.beneficiaire ?? "–"}</td>
                        <td className="text-right font-semibold whitespace-nowrap tabular-nums">−{formaterFCFA(d.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bloc>
        </Section>
      )}

      {vue === "historique" && (
        <Section titre="Qui a payé, cycle par cycle" pleineLargeur>
          <Bloc className="py-4">
            {entreesHistorique.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun cycle pour l&apos;instant.</p>
            ) : (
              <GrilleHistorique entete="Membre" {...construireHistorique(entreesHistorique)} />
            )}
          </Bloc>
          <p className="text-sm text-muted-foreground">
            « Payés » compte les cycles clôturés. Les {MAX_CYCLES_HISTORIQUE} derniers cycles au plus.
          </p>
        </Section>
      )}

      {vue === "caisse" && (
        <>
          <Section titre="La caisse">
            <Bloc>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-3 text-sm">
                <dt className="text-muted-foreground">Montant</dt>
                <dd className="text-right font-semibold">
                  {mensualite && caisse.nombreMois
                    ? `${formaterFCFA(caisse.montantCotisation)} par mois × ${caisse.nombreMois} = ${formaterFCFA(montantDuParMembre(caisse))}`
                    : `${formaterFCFA(caisse.montantCotisation)} par membre`}
                </dd>
                {caisse.type === "TONTINE" ? (
                  <>
                    <dt className="text-muted-foreground">Fréquence</dt>
                    <dd className="text-right font-semibold">{caisse.frequence ? LIBELLES_FREQUENCE[caisse.frequence] : "—"}</dd>
                    <dt className="text-muted-foreground">Échéance</dt>
                    <dd className="text-right font-semibold">{libelleEcheance(caisse.frequence, caisse.jourEcheance) ?? "—"}</dd>
                  </>
                ) : mensualite && grilleMois ? (
                  <>
                    <dt className="text-muted-foreground">Période</dt>
                    <dd className="text-right font-semibold">
                      {grilleMois.mois[0]} à {grilleMois.mois.at(-1)}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Date limite</dt>
                    <dd className="text-right font-semibold">
                      {caisse.dateLimite ? formaterDate(caisse.dateLimite) : "—"}
                      {caisse.dateLimite && caisse.dateLimite < jour && <span className="text-avertissement"> (dépassée)</span>}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Membres actifs</dt>
                <dd className="text-right font-semibold">{caisse._count.membres}</dd>
              </dl>
              <div className="grid grid-cols-2 gap-2 py-3">
                <Link href={`/caisses/${caisse.id}/modifier`} className={cn(buttonVariants({ variant: "outline" }), "text-base")}>
                  Modifier
                </Link>
                <form action={changerStatutCaisse}>
                  <input type="hidden" name="id" value={caisse.id} />
                  <input type="hidden" name="statut" value={archivee ? "ACTIVE" : "ARCHIVEE"} />
                  <BoutonEnvoi variant="outline" className="w-full text-base">
                    {archivee ? "Réactiver" : "Archiver"}
                  </BoutonEnvoi>
                </form>
              </div>
            </Bloc>
          </Section>

          {suivi && contexte?.cycleOuvert && (
            <Section titre={collecte ? "Fin de la collecte" : mensualite ? "Fin de la mensualité" : "Fin du cycle"}>
              <Cloture suivi={suivi} contexte={contexte} />
            </Section>
          )}

          {/* Gestion des membres (phase 4) : ajout, import, ordre de passage, retrait. */}
          <Section titre="Gérer les membres">
            <Bloc className="py-3">
              <Membres caisseId={caisse.id} ownerId={ownerId} tontine={caisse.type === "TONTINE"} archivee={archivee} />
            </Bloc>
          </Section>
        </>
      )}
    </>
  );
}

type Caisse = NonNullable<Awaited<ReturnType<typeof obtenirCaisse>>>;

/** Caisse sans cycle : ouverture du premier cycle (tontine) ou rattrapage d'une collecte. */
function PremierCycle({ caisse, nbCycles }: { caisse: Caisse; nbCycles: number }) {
  if (nbCycles > 0) return null;

  if (caisse.type === "COLLECTE") {
    // Rattrapage des collectes créées avant la phase 5 (aujourd'hui, le cycle est créé avec la caisse).
    return (
      <form action={creerCycleCollecte} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
        <input type="hidden" name="caisseId" value={caisse.id} />
        <p className="text-sm text-muted-foreground">Cette collecte n&apos;a pas encore de cycle.</p>
        <BoutonEnvoi className="text-base">
          Créer le cycle de la collecte
        </BoutonEnvoi>
      </form>
    );
  }

  const dateCalculee = prochaineEcheance(caisse.frequence, caisse.jourEcheance, aujourdhui());
  return (
    <FormulaireOuvertureCycle
      action={ouvrirPremierCycle.bind(null, caisse.id)}
      dateCalculee={dateCalculee ? versChampDate(dateCalculee) : ""}
      nbMembres={caisse._count.membres}
    />
  );
}

async function Membres({ caisseId, ownerId, tontine, archivee }: { caisseId: string; ownerId: string; tontine: boolean; archivee: boolean }) {
  const membres = await listerMembres(ownerId, caisseId);
  const actifs = membres.filter((m) => m.statut === "ACTIF");
  const inactifs = membres.filter((m) => m.statut === "INACTIF");
  // Les membres sans ordre (réactivés) sont listés en dernier (NULL en fin de tri) ;
  // on leur suggère le plus petit ordre libre.
  const suggestion = plusPetitOrdreLibre(actifs.map((m) => m.ordrePassage));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Membres actifs ({actifs.length})</h3>
        {!archivee && (
          <Link href={`/caisses/${caisseId}/membres/ajouter`} className={cn(buttonVariants(), "h-11 px-4 text-base")}>
            Ajouter
          </Link>
        )}
      </div>
      {!archivee && (
        <Link href={`/caisses/${caisseId}/importer`} className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}>
          Importer une liste (Word, Excel)
        </Link>
      )}

      {actifs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun membre actif.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actifs.map((m) => (
            <LigneMembre key={m.id} membre={m} suggestionOrdre={tontine && m.ordrePassage === null ? suggestion : undefined} />
          ))}
        </ul>
      )}

      {tontine && actifs.length >= 2 && (
        <FormulaireEchange
          caisseId={caisseId}
          membres={actifs.map((m) => ({ id: m.id, libelle: `${m.ordrePassage ?? "–"}. ${m.personne.nomComplet}` }))}
        />
      )}

      {inactifs.length > 0 && (
        <details>
          <summary className="flex h-11 cursor-pointer items-center text-muted-foreground">Membres inactifs ({inactifs.length})</summary>
          <ul className="mt-2 flex flex-col gap-2 opacity-70">
            {inactifs.map((m) => (
              <LigneMembre key={m.id} membre={m} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

type Membre = Awaited<ReturnType<typeof listerMembres>>[number];

function LigneMembre({ membre: m, suggestionOrdre }: { membre: Membre; suggestionOrdre?: number }) {
  const actif = m.statut === "ACTIF";
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-card p-2  ring-1 ring-border">
      <div className="flex items-center gap-3">
        {m.ordrePassage !== null && <span className="w-7 shrink-0 text-center font-semibold tabular-nums">{m.ordrePassage}</span>}
        <Link href={`/personnes/${m.personne.id}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
          <span className="truncate">{m.personne.nomComplet}</span>
          {m.personne.numeros[0] && (
            <span className="text-sm text-muted-foreground">{formaterTelephone(m.personne.numeros[0].numero)}</span>
          )}
        </Link>
        <form action={changerStatutMembre}>
          <input type="hidden" name="membreId" value={m.id} />
          <input type="hidden" name="statut" value={actif ? "INACTIF" : "ACTIF"} />
          <BoutonEnvoi variant="outline" className="h-11">
            {actif ? "Retirer" : "Réactiver"}
          </BoutonEnvoi>
        </form>
      </div>
      {suggestionOrdre !== undefined && (
        <div className="flex flex-col gap-1 pl-1">
          <span className="text-sm text-muted-foreground">Sans ordre de passage :</span>
          <FormulaireOrdre membreId={m.id} suggestion={suggestionOrdre} nom={m.personne.nomComplet} />
        </div>
      )}
    </li>
  );
}
