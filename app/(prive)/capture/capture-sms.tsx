"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { capturerSms } from "@/app/actions/capture";
import { CLASSE_ZONE_TEXTE } from "@/components/cotiz/styles";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CartePaiement } from "./carte-paiement";

const CHAMP_MANQUANT: Record<string, string> = { nom: "le nom", telephone: "le numéro", reference: "la référence" };

// Le presse-papiers n'est lisible qu'en contexte sécurisé (HTTPS ou localhost) et si le
// navigateur le permet. Lu côté navigateur uniquement (false pendant le rendu serveur).
const sAbonner = () => () => {};
const pressepapiersDisponible = () => window.isSecureContext && typeof navigator.clipboard?.readText === "function";

/** « Coller un SMS » : un champ, un bouton. La clé remet tout à zéro pour coller le suivant. */
export function CaptureSms() {
  const [cle, setCle] = useState(0);
  return <FormulaireSms key={cle} recommencer={() => setCle((c) => c + 1)} />;
}

function FormulaireSms({ recommencer }: { recommencer: () => void }) {
  const [etat, envoyer, enCours] = useActionState(capturerSms, undefined);
  const [texte, setTexte] = useState(etat?.texte ?? "");
  const disponible = useSyncExternalStore(sAbonner, pressepapiersDisponible, () => false);
  const [collerRefuse, setCollerRefuse] = useState(false);

  async function coller() {
    try {
      setTexte(await navigator.clipboard.readText());
    } catch {
      setCollerRefuse(true); // accès refusé : on cache le bouton, le champ reste utilisable
    }
  }

  if (etat?.enregistre) {
    const manquants = etat.enregistre.champsManquants.map((c) => CHAMP_MANQUANT[c] ?? c);
    return (
      <Resultat titre="Paiement enregistré" recommencer={recommencer}>
        <CartePaiement paiement={etat.enregistre}>
          {manquants.length > 0 && (
            <span className="text-sm text-avertissement">Le SMS ne contenait pas {manquants.join(", ")}.</span>
          )}
        </CartePaiement>
        <p className="text-sm text-muted-foreground">À rapprocher ce soir.</p>
      </Resultat>
    );
  }
  if (etat?.dejaEnregistre) {
    return (
      <Resultat titre="Déjà enregistré" recommencer={recommencer}>
        <p className="text-muted-foreground">Ce SMS a déjà été collé : rien n&apos;a été créé.</p>
        <CartePaiement paiement={etat.dejaEnregistre} />
      </Resultat>
    );
  }
  if (etat?.complete) {
    return (
      <Resultat titre="Paiement complété" recommencer={recommencer}>
        <p className="text-muted-foreground">
          {etat.complete.champs.length > 0
            ? "Le SMS a complété le paiement existant (aucun nouveau paiement)."
            : "Le paiement existant avait déjà toutes ces informations."}
        </p>
        <CartePaiement paiement={etat.complete} />
      </Resultat>
    );
  }
  if (etat?.nonLu) {
    return (
      <Resultat titre="SMS non lu" recommencer={recommencer}>
        <p className="text-muted-foreground">
          Le SMS n&apos;a pas pu être lu. Il est gardé (sans le solde) pour que tu crées le paiement à la main.
        </p>
        <Link href="/sms-non-lus" className="flex h-11 items-center underline underline-offset-4">
          Voir les SMS non lus
        </Link>
      </Resultat>
    );
  }

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor="texte">SMS Wave</Label>
        {disponible && !collerRefuse && (
          <Button type="button" variant="outline" onClick={coller} className="h-11">
            Coller
          </Button>
        )}
      </div>
      <textarea
        id="texte"
        name="texte"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={7}
        autoFocus
        placeholder="Vous avez recu 2.000F…"
        className={CLASSE_ZONE_TEXTE}
      />

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      {etat?.doublons ? (
        <section role="alert" className="flex flex-col gap-3 rounded-xl border border-avertissement/40 bg-avertissement/10 p-4">
          <h2 className="font-semibold">Peut-être déjà enregistré</h2>
          <p className="text-sm text-muted-foreground">Un paiement du même montant, le même jour, du même expéditeur existe déjà.</p>
          {etat.doublons.map((p) => (
            <CartePaiement key={p.id} paiement={p}>
              <Button type="submit" name="decision" value={`completer:${p.id}`} disabled={enCours} className="mt-1 h-11 text-base">
                C&apos;est le même : compléter
              </Button>
            </CartePaiement>
          ))}
          <Button type="submit" name="decision" value="nouveau" variant="outline" disabled={enCours} className="h-11 text-base">
            Enregistrer quand même
          </Button>
          <Button type="button" variant="ghost" onClick={recommencer} className="h-11 text-base">
            Annuler
          </Button>
        </section>
      ) : (
        <Button type="submit" disabled={enCours || !texte.trim()} className="h-11 text-base">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
      )}
    </form>
  );
}

function Resultat({ titre, recommencer, children }: { titre: string; recommencer: () => void; children: React.ReactNode }) {
  return (
    <section role="status" className="flex flex-col gap-3">
      <h2 className="font-heading text-base font-semibold">{titre}</h2>
      {children}
      <Button type="button" onClick={recommencer} autoFocus className="h-11 text-base">
        Coller un autre SMS
      </Button>
    </section>
  );
}
