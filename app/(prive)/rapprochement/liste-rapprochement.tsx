"use client";

import { Check } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ResumePaiement } from "@/app/actions/capture";
import { ignorerPaiement, validerRapprochement, validerSurs } from "@/app/actions/rapprochement";
import { ChoixPersonne } from "@/components/cotiz/choix-personne";
import { Repartition } from "@/components/cotiz/graphiques";
import { Pastille } from "@/components/cotiz/pastille";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formaterDate, formaterFCFA } from "@/lib/format";
import { proposerRepartition, restant, trierEcheances, verifierRepartition, type EcheanceDue, type Repartition as RepartitionAllocation } from "@/lib/matching/allocation";
import type { Identification, PersonneMatching } from "@/lib/matching/personne";
import { NIVEAUX_CONFIANCE, repartitionSure } from "@/lib/matching/surete";
import { formaterTelephone } from "@/lib/telephone";
import { normaliserNom } from "@/lib/texte";
import { cn } from "@/lib/utils";
import { CartePaiement } from "../capture/carte-paiement";

export type PaiementARapprocher = ResumePaiement & { identification: Identification; reprise: boolean };

/** Nom affiché d'un paiement dans la liste : nom Wave, sinon numéro, sinon la personne déjà connue. */
const expediteur = (p: PaiementARapprocher) =>
  p.nomExpediteur ?? (p.telephoneExpediteur ? formaterTelephone(p.telephoneExpediteur) : (p.personne ?? "Expéditeur inconnu"));

/** Mention des versés repris d'une liste importée, pour ne pas les confondre avec un SMS. */
function MentionReprise({ paiement }: { paiement: PaiementARapprocher }) {
  if (!paiement.reprise) return null;
  return <span className="text-xs font-medium text-muted-foreground">Versé de la liste importée (pas un SMS)</span>;
}

/**
 * Lot 4 : les paiements « sûrs » (numéro connu, compte juste : lib/matching/surete.ts) se valident
 * d'un coup ; les autres, « à vérifier », passent en premier et s'ouvrent un par un.
 * Les données partagées (personnes, échéances dues) ne sont envoyées qu'une fois pour toutes les cartes.
 * Téléphone : les cartes l'une sous l'autre. Ordinateur : la liste à gauche, la carte du paiement
 * choisi à droite ; après une validation, le suivant de la liste prend sa place.
 */
export function ListeRapprochement({
  paiements,
  personnes,
  echeancesParPersonne,
  payeesParImport,
}: {
  paiements: PaiementARapprocher[];
  personnes: PersonneMatching[];
  echeancesParPersonne: Record<string, EcheanceDue[]>;
  /** Personnes déjà payées par la colonne « Versé » d'une liste importée : montant repris. */
  payeesParImport: Record<string, number>;
}) {
  const parId = useMemo(() => new Map(personnes.map((p) => [p.id, p])), [personnes]);
  // Répartition sûre de chaque paiement (null : à vérifier). Le serveur refait tout au moment de valider.
  const surete = useMemo(
    () =>
      new Map(
        paiements.map((p) => {
          const id = p.identification.proposee;
          return [p.id, id ? repartitionSure(p.identification, p.montant, echeancesParPersonne[id] ?? []) : null];
        }),
      ),
    [paiements, echeancesParPersonne],
  );
  const aVerifier = paiements.filter((p) => !surete.get(p.id));
  const surs = paiements.filter((p) => surete.get(p.id));
  const totalSurs = surs.reduce((s, p) => s + p.montant, 0);
  const totalAVerifier = aVerifier.reduce((s, p) => s + p.montant, 0);
  const ordre = [...aVerifier, ...surs];

  const [choisi, setChoisi] = useState<string | null>(null);
  // Le paiement choisi a pu disparaître (validé, ignoré) : on passe au premier de la liste.
  const selection = ordre.find((p) => p.id === choisi) ?? ordre[0];

  /** Résumé « Caisse, cycle n » de la répartition sûre d'un paiement. */
  function resumeSur(p: PaiementARapprocher) {
    const dues = new Map((echeancesParPersonne[p.identification.proposee ?? ""] ?? []).map((e) => [e.id, e]));
    return (surete.get(p.id)?.lignes ?? []).map((l) => `${dues.get(l.echeanceId)?.caisseNom}, cycle ${dues.get(l.echeanceId)?.cycleNumero}`).join(" + ");
  }

  const carte = (p: PaiementARapprocher) => (
    <CarteRapprochement paiement={p} personnes={personnes} parId={parId} echeancesParPersonne={echeancesParPersonne} payeesParImport={payeesParImport} />
  );

  const validationGroupee = surs.length > 0 && (
    <form action={validerSurs}>
      {surs.map((p) => (
        <input key={p.id} type="hidden" name="paiementId" value={p.id} />
      ))}
      <BoutonValiderSurs nombre={surs.length} total={totalSurs} />
    </form>
  );

  return (
    <>
      <div data-pleine-largeur className="flex flex-col gap-2">
        <Repartition
          libelle="Paiements à rapprocher"
          parts={[
            { libelle: `${surs.length} sûr${surs.length > 1 ? "s" : ""} · ${formaterFCFA(totalSurs)}`, valeur: totalSurs, fond: "bg-paye" },
            { libelle: `${aVerifier.length} à vérifier · ${formaterFCFA(totalAVerifier)}`, valeur: totalAVerifier, fond: "bg-or" },
          ]}
        />
      </div>

      {/* Téléphone */}
      <div className="flex flex-col gap-5 lg:hidden">
        {aVerifier.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">À vérifier ({aVerifier.length})</h2>
            <ul className="flex flex-col gap-4">
              {aVerifier.map((p) => (
                <li key={p.id}>{carte(p)}</li>
              ))}
            </ul>
          </section>
        )}
        {surs.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">Sûrs, prêts à valider ({surs.length})</h2>
            <ul className="flex flex-col divide-y divide-border rounded-2xl bg-card px-4 ring-1 ring-border">
              {surs.map((p) => (
                <li key={p.id}>
                  {/* Ouvrir la ligne donne la carte complète, pour corriger un paiement avant le groupe. */}
                  <details className="group">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-semibold">{parId.get(p.identification.proposee ?? "")?.nomComplet}</span>
                        <span className="truncate text-xs text-muted-foreground">{resumeSur(p)}</span>
                        <MentionReprise paiement={p} />
                        <PastilleConfiance identification={p.identification} />
                      </span>
                      <span className="shrink-0 font-semibold">{formaterFCFA(p.montant)}</span>
                    </summary>
                    <div className="pb-3">{carte(p)}</div>
                  </details>
                </li>
              ))}
            </ul>
            {validationGroupee}
            <p className="text-center text-xs text-muted-foreground">Chaque validation reste annulable depuis « Derniers rapprochés ».</p>
          </section>
        )}
      </div>

      {/* Ordinateur */}
      <div data-pleine-largeur className="hidden items-start gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          {validationGroupee}
          {[
            { titre: "À vérifier", liste: aVerifier },
            { titre: "Sûrs", liste: surs },
          ]
            .filter((g) => g.liste.length > 0)
            .map((g) => (
              <section key={g.titre} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {g.titre} ({g.liste.length})
                </h2>
                <ul aria-label={`Paiements ${g.titre.toLowerCase()}`} className="flex flex-col gap-2">
                  {g.liste.map((p) => {
                    const actif = p.id === selection?.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setChoisi(p.id)}
                          aria-current={actif ? "true" : undefined}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-border transition-all hover:ring-primary/50",
                            actif && "bg-secondary ring-2 ring-primary",
                          )}
                        >
                          <span className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-semibold">{expediteur(p)}</span>
                            <MentionReprise paiement={p} />
                            <span className="text-xs text-muted-foreground">{formaterDate(new Date(p.dateReception))}</span>
                            <PastilleConfiance identification={p.identification} />
                          </span>
                          <span className="shrink-0 font-bold">{formaterFCFA(p.montant)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
        {/* key : une carte neuve (choix, répartition) à chaque changement de paiement. */}
        {selection && (
          <div key={selection.id} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-300">
            {carte(selection)}
          </div>
        )}
      </div>
    </>
  );
}

/** Bouton or de la validation groupée ; « Validation… » pendant l'envoi. */
function BoutonValiderSurs({ nombre, total }: { nombre: number; total: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="h-14 w-full bg-or text-base text-or-foreground hover:bg-or/90">
      <Check aria-hidden />
      {pending ? "Validation…" : `Valider ${nombre > 1 ? `les ${nombre} sûrs` : "le paiement sûr"} · ${formaterFCFA(total)}`}
    </Button>
  );
}

/** Confiance dans la personne proposée : 3 niveaux et la raison, ou « à choisir ». */
function PastilleConfiance({ identification }: { identification: Identification }) {
  const { proposee, candidats } = identification;
  const candidat = proposee ? candidats.find((c) => c.id === proposee) : undefined;
  if (candidat) {
    const ton = { haute: "paye", moyenne: "info", basse: "avertissement" } as const;
    return (
      <Pastille ton={ton[candidat.confiance]} className="w-fit px-2 py-0.5">
        {NIVEAUX_CONFIANCE[candidat.confiance]} · {candidat.raison}
      </Pastille>
    );
  }
  return (
    <Pastille ton="avertissement" className="w-fit px-2 py-0.5">
      {candidats.length > 1 ? `${candidats.length} personnes possibles` : "Personne à choisir"}
    </Pastille>
  );
}

function CarteRapprochement({
  paiement,
  personnes,
  parId,
  echeancesParPersonne,
  payeesParImport,
}: {
  paiement: PaiementARapprocher;
  personnes: PersonneMatching[];
  parId: Map<string, PersonneMatching>;
  echeancesParPersonne: Record<string, EcheanceDue[]>;
  payeesParImport: Record<string, number>;
}) {
  const [etat, envoyer, enCours] = useActionState(validerRapprochement.bind(null, paiement.id), undefined);
  const { identification } = paiement;
  const [personneId, setPersonneId] = useState<string | null>(identification.proposee);
  const [option, setOption] = useState(0);
  const [edition, setEdition] = useState<Record<string, string> | null>(null);

  const personne = personneId ? parId.get(personneId) : undefined;
  const dues = useMemo(() => trierEcheances(personneId ? (echeancesParPersonne[personneId] ?? []) : []), [personneId, echeancesParPersonne]);
  const duesParId = useMemo(() => new Map(dues.map((e) => [e.id, e])), [dues]);
  const proposition = useMemo(() => proposerRepartition(paiement.montant, dues), [paiement.montant, dues]);
  const options = [proposition.principale, ...proposition.alternatives];

  // Répartition affichée et envoyée : une option proposée, ou la saisie de « Modifier ».
  const repartition: RepartitionAllocation = edition
    ? (() => {
        const lignes = Object.entries(edition)
          .map(([echeanceId, v]) => ({ echeanceId, montant: Number(v.replace(/\D/g, "")) || 0 }))
          .filter((l) => l.montant > 0);
        return { lignes, excedent: paiement.montant - lignes.reduce((s, l) => s + l.montant, 0) };
      })()
    : (options[option] ?? options[0]);
  const probleme = personne ? verifierRepartition(paiement.montant, repartition.lignes, dues) : null;

  function choisirPersonne(id: string | null) {
    setPersonneId(id);
    setOption(0);
    setEdition(null);
  }

  function ouvrirEdition() {
    const valeurs: Record<string, string> = {};
    for (const e of dues) valeurs[e.id] = String(repartition.lignes.find((l) => l.echeanceId === e.id)?.montant ?? "");
    setEdition(valeurs);
  }

  // Mémoriser le numéro (coché) ou le nom Wave (décoché), s'ils sont nouveaux pour cette personne.
  const tel = paiement.telephoneExpediteur;
  const numeroNouveau = Boolean(personne && tel && !personne.numeros.includes(tel));
  const autresAvecCeNumero = tel ? personnes.filter((p) => p.id !== personneId && p.numeros.includes(tel)) : [];
  const nomWave = paiement.nomExpediteur;
  const aliasNouveau = Boolean(
    personne && nomWave && ![personne.nomComplet, ...personne.aliasWave].some((n) => normaliserNom(n) === normaliserNom(nomWave)),
  );

  const candidat = identification.candidats.find((c) => c.id === personneId);
  // Déjà payée par la colonne « Versé » d'une liste importée, plus rien de dû : sûrement le même argent.
  const dejaRepris = personne && dues.length === 0 ? payeesParImport[personne.id] : undefined;

  return (
    <form action={envoyer} className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
      <input type="hidden" name="paiementId" value={paiement.id} />
      {/* Déjà dans une carte : le résumé du paiement s'affiche à plat, séparé par un trait. */}
      <CartePaiement paiement={paiement} className="rounded-none border-b border-border p-0 pb-3 shadow-none ring-0">
        <MentionReprise paiement={paiement} />
      </CartePaiement>

      {/* Étape 1 : la personne */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Qui a payé ?</h3>
        {identification.candidats.length > 0 && (
          <div className="flex flex-col gap-2">
            {identification.candidats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choisirPersonne(c.id)}
                aria-pressed={personneId === c.id}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-border",
                  personneId === c.id && "bg-secondary ring-2 ring-primary",
                )}
              >
                <span
                  aria-hidden
                  className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", personneId === c.id ? "border-primary bg-primary" : "border-input")}
                >
                  {personneId === c.id && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{c.nomComplet}</span>
                  <span className="text-xs text-muted-foreground">
                    {NIVEAUX_CONFIANCE[c.confiance]} · {c.raison}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {identification.candidats.length === 0 && <p className="text-sm text-muted-foreground">Personne trouvée automatiquement.</p>}
        <ChoixPersonne
          personnes={personnes}
          valeur={personneId && !candidat ? personneId : null}
          onChoisir={choisirPersonne}
          libelle={candidat ? "Chercher une autre personne" : "Chercher la personne"}
        />
        {personneId && <input type="hidden" name="personneId" value={personneId} />}
      </section>

      {/* Étape 2 : la répartition */}
      {personne && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Répartition</h3>
          {edition ? (
            <div className="flex flex-col gap-2">
              {dues.length === 0 && <p className="text-sm text-muted-foreground">Aucune échéance due pour {personne.nomComplet}.</p>}
              {dues.map((e) => (
                <label key={e.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {e.caisseNom}, cycle {e.cycleNumero}
                    <span className="block text-muted-foreground">reste dû {formaterFCFA(restant(e))}</span>
                  </span>
                  <Input
                    inputMode="numeric"
                    value={edition[e.id] ?? ""}
                    onChange={(ev) => setEdition({ ...edition, [e.id]: ev.target.value })}
                    className="h-11 w-28 text-right text-base"
                  />
                </label>
              ))}
            </div>
          ) : repartition.lignes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune échéance due pour {personne.nomComplet}.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl bg-muted px-3">
              {repartition.lignes.map((l) => {
                const e = duesParId.get(l.echeanceId);
                return (
                  <li key={l.echeanceId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      {e?.caisseNom}
                      <span className="block text-xs text-muted-foreground">
                        Cycle {e?.cycleNumero}
                        {e && l.montant < restant(e) && " · paiement partiel"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formaterFCFA(l.montant)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {repartition.excedent > 0 && (
            <p className="text-sm text-avertissement">À rembourser : {formaterFCFA(repartition.excedent)}</p>
          )}

          {/* Autres possibilités équivalentes, choisies en un clic (cahier, phase 7). */}
          {!edition &&
            options.map((o, i) =>
              i === option ? null : (
                <Button key={i} type="button" variant="outline" onClick={() => setOption(i)} className="h-auto min-h-11 justify-start text-left text-sm whitespace-normal">
                  Autre option : {o.lignes.map((l) => `${duesParId.get(l.echeanceId)?.caisseNom}, cycle ${duesParId.get(l.echeanceId)?.cycleNumero}`).join(" + ")}
                </Button>
              ),
            )}

          {repartition.lignes.map((l) => (
            <input key={l.echeanceId} type="hidden" name={`ligne-${l.echeanceId}`} value={l.montant} />
          ))}
        </section>
      )}

      {/* Mémoriser pour la prochaine fois */}
      {numeroNouveau && tel && (
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="enregistrerNumero" defaultChecked className="mt-0.5 size-5" />
          <span>
            Enregistrer le {formaterTelephone(tel)} pour {personne?.nomComplet}
            {autresAvecCeNumero.length > 0 && (
              <span className="block text-avertissement">
                Attention : ce numéro est déjà celui de {autresAvecCeNumero.map((p) => p.nomComplet).join(", ")}.
              </span>
            )}
          </span>
        </label>
      )}
      {aliasNouveau && nomWave && (
        <label className="flex min-h-11 items-start gap-2 text-sm">
          <input type="checkbox" name="enregistrerAlias" className="mt-0.5 size-5" />
          <span>Enregistrer « {nomWave} » comme alias Wave de {personne?.nomComplet}</span>
        </label>
      )}

      {dejaRepris && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-avertissement/10 p-3 ring-1 ring-avertissement/30">
          <p className="text-sm">
            <span className="font-semibold">Déjà payée par la liste importée ({formaterFCFA(dejaRepris)}).</span> Ce SMS est sûrement le même
            argent : valider le mettrait « à rembourser ».
          </p>
          <Button type="submit" formAction={ignorerPaiement} disabled={enCours} className="h-11 w-full bg-or text-base text-or-foreground hover:bg-or/90">
            Ignorer, c&apos;est le même argent
          </Button>
        </div>
      )}

      {(etat?.erreur || probleme) && (
        <p role="alert" className="text-sm text-destructive">
          {etat?.erreur ?? probleme}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" variant={dejaRepris ? "outline" : "default"} disabled={!personne || Boolean(probleme) || enCours} className="text-base">
          <Check aria-hidden />
          {enCours ? "Validation…" : "Valider"}
        </Button>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" disabled={!personne} onClick={() => (edition ? setEdition(null) : ouvrirEdition())} className="h-auto min-h-11 shrink text-sm whitespace-normal">
            {edition ? "Annuler la modification" : "Changer la répartition"}
          </Button>
          {/* formAction : envoie le même formulaire (paiementId) à une autre action. Éloigné de « Valider ». */}
          <Button type="submit" formAction={ignorerPaiement} variant="ghost" disabled={enCours} className="text-sm text-muted-foreground">
            Ignorer
          </Button>
        </div>
      </div>
    </form>
  );
}
