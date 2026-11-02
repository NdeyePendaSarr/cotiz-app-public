import { ArrowLeftRight, CalendarCheck, ChevronRight, HandCoins, MessageSquareWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EnTete } from "@/components/cotiz/en-tete";
import { Anneau, Barres, Repartition } from "@/components/cotiz/graphiques";
import { Bloc, LIGNE, Section } from "@/components/cotiz/section";
import { Pastille } from "@/components/cotiz/pastille";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { exigerUtilisatrice, profilUtilisatrice } from "@/lib/auth";
import { aujourdhui } from "@/lib/cycles/dates";
import { daterRepriseParSms } from "@/app/actions/datation";
import { Button } from "@/components/ui/button";
import { compterSmsNonLus } from "@/lib/donnees/paiements";
import { paiementsRecus } from "@/lib/donnees/statistiques";
import { compterARapprocher, datationsPossibles } from "@/lib/donnees/rapprochement";
import { compterARembourser, cyclesOuverts } from "@/lib/donnees/suivi";
import { formaterDate, formaterFCFA, formaterJourCourt, LIBELLES_CANAL, LIBELLES_TYPE } from "@/lib/format";
import { moyenneParJour, recuParCanal, recuParJour, totalReprises } from "@/lib/statistiques";
import { resumerCycle } from "@/lib/suivi/cycle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord · Cotiz" };

// Tableau de bord (cahier, phase 9 ; graphiques, lot 3) : l'anneau de ce qui est reçu, les chiffres
// clés, ce qui attend une action, l'argent arrivé jour par jour et par canal, puis chaque cycle ouvert.
export default function PageTableauDeBord() {
  return (
    <Suspense fallback={<><EnTete titre="Tableau de bord" surtitre="Cycles en cours" /><SqueletteListe /></>}>
      <Accueil />
    </Suspense>
  );
}

async function Accueil() {
  const { id: ownerId } = await exigerUtilisatrice();
  const jour = aujourdhui();
  const [{ nom }, aRapprocher, smsNonLus, aRembourser, cycles, recus] = await Promise.all([
    profilUtilisatrice(),
    compterARapprocher(ownerId),
    compterSmsNonLus(ownerId),
    compterARembourser(ownerId),
    cyclesOuverts(ownerId),
    paiementsRecus(ownerId, jour, JOURS_GRAPHIQUE),
  ]);
  const resumes = cycles.map((c) => ({ ...c, r: resumerCycle(c.echeances, c.dateEcheance, jour) }));
  const recu = resumes.reduce((s, c) => s + c.r.recu, 0);
  const attendu = resumes.reduce((s, c) => s + c.r.attendu, 0);
  const pourcentage = attendu > 0 ? Math.round((recu / attendu) * 100) : 0;
  const echeances = cycles.reduce((s, c) => s + c.echeances.length, 0);
  const aJour = echeances - resumes.reduce((s, c) => s + c.r.pasAJour, 0);
  // Argent arrivé (date de réception), rapproché ou non : peut différer du « reçu » réparti ci-dessus.
  const parJour = recuParJour(recus, jour, JOURS_GRAPHIQUE);
  const parCanal = recuParCanal(recus);
  const totalRecent = parCanal.reduce((s, c) => s + c.montant, 0);
  const reprises = totalReprises(recus);

  const aFaire = [
    { href: "/rapprochement", nombre: aRapprocher, singulier: "Paiement à rapprocher", pluriel: "Paiements à rapprocher", Icone: ArrowLeftRight },
    { href: "/sms-non-lus", nombre: smsNonLus, singulier: "SMS non lu", pluriel: "SMS non lus", Icone: MessageSquareWarning },
    { href: "/a-rembourser", nombre: aRembourser, singulier: "Excédent à rembourser", pluriel: "Excédents à rembourser", Icone: HandCoins },
  ].filter((t) => t.nombre > 0);

  return (
    <>
      <EnTete titre={`Bonjour ${nom}`} surtitre="Cycles en cours">
        <div className="mt-3 flex items-center gap-5">
          <Anneau
            segments={[{ libelle: "Reçu", valeur: recu, trait: "stroke-or" }]}
            total={Math.max(attendu, recu)}
            libelle={`${pourcentage} % reçu sur les cycles en cours`}
            taille={128}
          >
            <span className="font-heading text-2xl font-bold">{pourcentage} %</span>
            <span className="text-xs text-nuit-doux">reçu</span>
          </Anneau>
          <dl className="flex min-w-0 flex-col gap-3">
            <div>
              <dt className="text-sm text-nuit-doux">Argent reçu</dt>
              <dd className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">{formaterFCFA(recu)}</dd>
              <dd className="text-sm text-nuit-doux">sur {formaterFCFA(attendu)}</dd>
            </div>
            <div>
              <dt className="text-sm text-nuit-doux">Membres à jour</dt>
              <dd className="font-heading text-xl font-bold">
                {aJour} <span className="text-base font-medium text-nuit-doux">/ {echeances}</span>
              </dd>
            </div>
          </dl>
        </div>
      </EnTete>

      <dl data-pleine-largeur className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border lg:grid-cols-4">
        {[
          { libelle: "Reste à recevoir", valeur: formaterFCFA(Math.max(0, attendu - recu)) },
          { libelle: `Moyenne par jour (${JOURS_GRAPHIQUE} j)`, valeur: formaterFCFA(moyenneParJour(parJour)) },
          { libelle: "Attendu", valeur: formaterFCFA(attendu) },
          { libelle: "Cycles en cours", valeur: String(resumes.length) },
        ].map((c) => (
          <div key={c.libelle} className="bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">{c.libelle}</dt>
            <dd className="font-heading text-lg font-bold whitespace-nowrap">{c.valeur}</dd>
          </div>
        ))}
      </dl>

      {/* Ordinateur : « À faire » en cartes côte à côte, cycles en grille (lot C). */}
      <Section titre="À faire" pleineLargeur>
        {aFaire.length === 0 ? (
          <p className="text-muted-foreground">Rien en attente.</p>
        ) : (
          <>
            <ul className="hidden gap-4 lg:grid lg:grid-cols-3">
              {aFaire.map(({ href, nombre, singulier, pluriel, Icone }) => (
                <li key={href}>
                  <Link href={href} className={CARTE}>
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icone aria-hidden className="size-6" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-3xl font-bold tracking-tight">{nombre}</span>
                      <span className="text-sm font-medium text-muted-foreground">{nombre > 1 ? pluriel : singulier}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Bloc className="lg:hidden">
              {aFaire.map(({ href, nombre, singulier, pluriel, Icone }) => (
                <Link key={href} href={href} className={LIGNE}>
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary">
                      <Icone aria-hidden className="size-5" />
                    </span>
                    <span className="font-medium">{nombre > 1 ? pluriel : singulier}</span>
                  </span>
                  <span className="min-w-7 rounded-full bg-primary px-2 text-center text-sm leading-7 font-bold text-primary-foreground">{nombre}</span>
                </Link>
              ))}
            </Bloc>
          </>
        )}
      </Section>

      <div data-pleine-largeur className="grid gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
        <Section titre="Reçu par jour" action={<span className="text-sm text-muted-foreground">{JOURS_GRAPHIQUE} derniers jours</span>}>
          <Bloc className="py-4">
            <Barres
              libelle={`Argent arrivé chaque jour, sur les ${JOURS_GRAPHIQUE} derniers jours`}
              barres={parJour.map((j, i) => ({
                cle: j.date.toISOString(),
                libelle: formaterJourCourt(j.date),
                valeur: j.montant,
                accent: i === parJour.length - 1,
              }))}
              debut={formaterJourCourt(parJour[0].date)}
              fin={`Aujourd'hui · ${formaterFCFA(parJour[parJour.length - 1].montant)}`}
            />
            {reprises > 0 && (
              <p className="pt-3 text-xs text-muted-foreground">
                Sans les {formaterFCFA(reprises)} repris d&apos;une liste importée : leur date de paiement n&apos;est pas connue.
              </p>
            )}
            {reprises > 0 && (
              <Link href="/a-dater" className="flex h-11 items-center text-sm font-semibold text-primary">
                Dater à la main les versés restants
              </Link>
            )}
            {/* Calcul plus lourd (tous les SMS ignorés) : chargé à part, l'accueil ne l'attend pas (audit, lot 3). */}
            {reprises > 0 && (
              <Suspense fallback={null}>
                <BoutonDatation ownerId={ownerId} />
              </Suspense>
            )}
          </Bloc>
        </Section>
        <Section titre="Par canal" action={<span className="text-sm text-muted-foreground">{formaterFCFA(totalRecent)}</span>}>
          <Bloc className="py-4">
            {totalRecent === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement sur les {JOURS_GRAPHIQUE} derniers jours.</p>
            ) : (
              <Repartition
                libelle="Argent arrivé par canal"
                parts={parCanal.map((c) => ({ libelle: LIBELLES_CANAL[c.canal], valeur: c.montant, fond: FOND_CANAL[c.canal] }))}
              />
            )}
          </Bloc>
        </Section>
      </div>

      <Section
        pleineLargeur
        titre="Cycles en cours"
        action={
          <Link href="/caisses" className="flex h-11 items-center text-sm font-semibold text-primary">
            Mes caisses
          </Link>
        }
      >
        {resumes.length === 0 ? (
          <p className="text-muted-foreground">Aucun cycle ouvert.</p>
        ) : (
          <>
            <ul className="hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
              {resumes.map((c) => {
                const pourcentage = c.r.attendu > 0 ? Math.round((c.r.recu / c.r.attendu) * 100) : 0;
                return (
                  <li key={c.id}>
                    <Link href={`/caisses/${c.caisse.id}`} className={cn(CARTE, "flex-col items-stretch gap-3")}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 flex-col">
                          <span className="line-clamp-2 font-semibold">{c.caisse.nom}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.caisse.type === "TONTINE" ? `Cycle ${c.numero}` : LIBELLES_TYPE.COLLECTE} · échéance {formaterDate(c.dateEcheance)}
                          </span>
                        </span>
                        <Pastille ton="info">{pourcentage} %</Pastille>
                      </span>
                      <span>
                        <span className="text-2xl font-bold tracking-tight">{formaterFCFA(c.r.recu)}</span>
                        <span className="text-sm text-muted-foreground"> / {formaterFCFA(c.r.attendu)}</span>
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pourcentage}%` }} />
                      </span>
                      <span className={cn("text-xs font-medium", c.r.pasAJour === 0 ? "text-paye" : c.r.echeancePassee ? "text-retard" : "text-muted-foreground")}>
                        {c.r.pasAJour === 0
                          ? "Tout le monde est à jour"
                          : `${c.r.pasAJour} membre${c.r.pasAJour > 1 ? "s" : ""} pas à jour${c.r.echeancePassee ? " · échéance passée" : ""}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Bloc className="lg:hidden">
              {resumes.map((c) => (
                <Link key={c.id} href={`/caisses/${c.caisse.id}`} className={LIGNE}>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 font-semibold">{c.caisse.nom}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.caisse.type === "TONTINE" ? `Cycle ${c.numero}` : LIBELLES_TYPE.COLLECTE} · échéance {formaterDate(c.dateEcheance)}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${c.r.attendu > 0 ? Math.round((c.r.recu / c.r.attendu) * 100) : 0}%` }}
                      />
                    </span>
                    {c.r.pasAJour > 0 && (
                      <span className={cn("text-xs font-medium", c.r.echeancePassee ? "text-retard" : "text-muted-foreground")}>
                        {c.r.pasAJour} membre{c.r.pasAJour > 1 ? "s" : ""} pas à jour{c.r.echeancePassee && " · échéance passée"}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-right text-sm font-semibold">
                    <span>
                      {formaterFCFA(c.r.recu)}
                      <span className="block text-xs font-normal text-muted-foreground">/ {formaterFCFA(c.r.attendu)}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              ))}
            </Bloc>
          </>
        )}
      </Section>
    </>
  );
}

/** Période des graphiques de l'accueil. */
const JOURS_GRAPHIQUE = 14;

/** Couleur de chaque canal (ordre fixe, palette validée dans globals.css). */
const FOND_CANAL = { WAVE: "bg-graph-wave", ORANGE_MONEY: "bg-graph-om", CASH: "bg-graph-cash" } as const;

/** Carte de l'accueil sur ordinateur : sans ombre, se teinte au survol. */
const CARTE =
  "flex h-full items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-all duration-200 hover:bg-secondary/40 hover:ring-primary/40";

/** Rattrapage : versés importés que l'on peut dater avec le SMS ignoré qui était le même argent. */
async function BoutonDatation({ ownerId }: { ownerId: string }) {
  const datations = await datationsPossibles(ownerId);
  if (datations.length === 0) return null;
  return (
    <form action={daterRepriseParSms} className="pt-2">
      <Button type="submit" variant="outline" className="h-auto min-h-11 w-full text-sm whitespace-normal">
        <CalendarCheck aria-hidden />
        Dater {datations.length} versé{datations.length > 1 ? "s" : ""} avec {datations.length > 1 ? "leurs" : "son"} SMS ignoré{datations.length > 1 ? "s" : ""}
      </Button>
    </form>
  );
}
