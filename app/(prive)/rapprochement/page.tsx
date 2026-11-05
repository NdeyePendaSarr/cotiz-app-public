import { BoutonEnvoi } from "@/components/cotiz/bouton-envoi";
import type { Metadata } from "next";
import { EnTete } from "@/components/cotiz/en-tete";
import { Suspense } from "react";
import { annulerRapprochement, remettreARapprocher } from "@/app/actions/rapprochement";
import { SqueletteListe } from "@/components/cotiz/squelette";
import { exigerUtilisatrice } from "@/lib/auth";
import { derniersRapproches, echeancesDues, paiementsARapprocher, paiementsIgnores, personnesPourMatching } from "@/lib/donnees/rapprochement";
import { payeesParImport } from "@/lib/donnees/suivi";
import { comptesParPersonne } from "@/lib/donnees/comptes";
import { excedentPaiement } from "@/lib/dons";
import { formaterDateHeure, formaterFCFA } from "@/lib/format";
import { identifierPersonne } from "@/lib/matching/personne";
import { prisma } from "@/lib/prisma";
import { CartePaiement } from "../capture/carte-paiement";
import { ListeRapprochement } from "./liste-rapprochement";

export const metadata: Metadata = { title: "Rapprochement · Cotiz" };

// Le soir : chaque paiement capturé reçoit une personne et une répartition, validée d'un clic.
export default function PageRapprochement() {
  return (
    <Suspense fallback={<><EnTete titre="Rapprochement" surtitre="Le soir" /><SqueletteListe /></>}>
      <Contenu />
    </Suspense>
  );
}

const versResume = <T extends { dateReception: Date; personne: { nomComplet: string } | null }>(p: T) => ({
  ...p,
  dateReception: p.dateReception.toISOString(),
  personne: p.personne?.nomComplet ?? null,
});

async function Contenu() {
  const { id: ownerId } = await exigerUtilisatrice();
  const [paiements, personnes, dues, rapproches, ignores, repris, comptes] = await Promise.all([
    paiementsARapprocher(ownerId),
    personnesPourMatching(ownerId),
    echeancesDues(prisma, ownerId),
    derniersRapproches(ownerId),
    paiementsIgnores(ownerId),
    payeesParImport(prisma, ownerId),
    comptesParPersonne(ownerId),
  ]);

  // Étape 1 faite ici (côté serveur) ; la répartition est recalculée dans la carte au besoin.
  const aRapprocher = paiements.map(({ origine, ...p }) => ({
    ...versResume(p),
    identification: identifierPersonne(p, personnes),
    // Versé repris de la colonne « Versé » d'une liste importée (pas un SMS) : il n'a ni nom Wave ni numéro.
    reprise: origine === "REPRISE_IMPORT",
  }));

  const total = aRapprocher.reduce((s, p) => s + p.montant, 0);
  return (
    <>
      <EnTete titre="Rapprochement" surtitre={`${aRapprocher.length} paiement${aRapprocher.length > 1 ? "s" : ""} à rapprocher`} montant={formaterFCFA(total)}>
        <p className="text-sm text-nuit-doux">Les paiements sûrs se valident d&apos;un coup ; les autres, un par un.</p>
      </EnTete>
      {aRapprocher.length === 0 ? (
        <p role="status" className="rounded-2xl bg-secondary p-4 text-center font-semibold text-secondary-foreground">
          Tout est rapproché.
        </p>
      ) : (
        <ListeRapprochement paiements={aRapprocher} personnes={personnes} echeancesParPersonne={dues} payeesParImport={repris} comptesParPersonne={comptes} />
      )}

      {rapproches.length > 0 && (
        <details>
          <summary className="flex h-11 cursor-pointer items-center text-muted-foreground">Derniers rapprochés, 7 jours ({rapproches.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rapproches.map((p) => {
              const excedent = excedentPaiement(p.montant, p.allocations, p.don, p.mouvementCompte);
              const cycleOuvert = p.allocations.every((a) => a.echeance.cycle.statut === "OUVERT");
              const annulable = cycleOuvert && !p.rembourseLe;
              return (
                <li key={p.id}>
                  <CartePaiement paiement={versResume(p)} lienHistorique>
                    <span className="text-sm text-muted-foreground">
                      {p.mouvementCompte
                        ? `Versé sur le compte « ${p.mouvementCompte.caisse.nom} » : ${formaterFCFA(p.mouvementCompte.montant)}`
                        : p.allocations.map((a) => `${a.echeance.cycle.caisse.nom}, cycle ${a.echeance.cycle.numero} : ${formaterFCFA(a.montant)}`).join(" · ") ||
                          "Aucune échéance"}
                    </span>
                    {p.don && <span className="text-sm text-paye">Bonne volonté : {formaterFCFA(p.don.montant)}</span>}
                    {excedent > 0 && (
                      <span className="text-sm text-avertissement">À rembourser : {formaterFCFA(excedent)}</span>
                    )}
                    {p.rapprocheLe && <span className="text-xs text-muted-foreground">Rapproché le {formaterDateHeure(p.rapprocheLe)}</span>}
                    {annulable ? (
                      <form action={annulerRapprochement}>
                        <input type="hidden" name="paiementId" value={p.id} />
                        <BoutonEnvoi variant="outline" className="mt-1 h-11 w-full text-base">
                          Annuler le rapprochement
                        </BoutonEnvoi>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {cycleOuvert ? "Excédent déjà remboursé : plus d'annulation possible." : "Cycle clôturé : plus d'annulation possible."}
                      </span>
                    )}
                  </CartePaiement>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {ignores.length > 0 && (
        <details>
          <summary className="flex h-11 cursor-pointer items-center text-muted-foreground">Paiements ignorés ({ignores.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {ignores.map((p) => (
              <li key={p.id}>
                <CartePaiement paiement={versResume(p)} lienHistorique>
                  {p.dateRepriseId ? (
                    <span className="text-sm text-muted-foreground">Même argent qu&apos;un versé de la liste importée : sa date y a été reportée.</span>
                  ) : (
                    <form action={remettreARapprocher}>
                      <input type="hidden" name="paiementId" value={p.id} />
                      <BoutonEnvoi variant="outline" className="mt-1 h-11 w-full text-base">
                        Remettre à rapprocher
                      </BoutonEnvoi>
                    </form>
                  )}
                </CartePaiement>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
