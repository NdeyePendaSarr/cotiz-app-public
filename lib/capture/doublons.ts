// Doublons de paiements. Le doublon CERTAIN (même canal + même référence) est bloqué par la
// base (contrainte unique). Ici : le doublon PROBABLE, sans référence commune.
// Fonctions pures, testées.

export type PaiementComparable = {
  id: string;
  canal: "WAVE" | "ORANGE_MONEY" | "CASH";
  montant: number;
  dateReception: Date;
  reference: string | null;
  telephoneExpediteur: string | null;
  nomExpediteur: string | null;
  texteBrut: string | null;
  personneId: string | null;
};

export type NouveauPaiement = {
  canal: PaiementComparable["canal"];
  montant: number;
  dateReception: Date;
  reference: string | null;
  telephoneExpediteur: string | null;
  /** Personnes concernées : celle choisie à la saisie, ou celles qui ont ce numéro. */
  personneIds: string[];
};

const memeJour = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/**
 * Même canal, même montant, même jour, et même numéro ou même personne. Deux références
 * différentes ne sont jamais un doublon (Wave donne une référence unique par transaction).
 */
export function chercherDoublonsProbables(nouveau: NouveauPaiement, existants: PaiementComparable[]) {
  return existants.filter((p) => {
    if (p.canal !== nouveau.canal || p.montant !== nouveau.montant || !memeJour(p.dateReception, nouveau.dateReception)) return false;
    if (p.reference && nouveau.reference && p.reference !== nouveau.reference) return false;
    const memeNumero = Boolean(p.telephoneExpediteur && p.telephoneExpediteur === nouveau.telephoneExpediteur);
    const memePersonne = Boolean(p.personneId && nouveau.personneIds.includes(p.personneId));
    return memeNumero || memePersonne;
  });
}

/**
 * « C'est le même : compléter » : ajoute au paiement existant ce que le SMS apporte
 * (référence, numéro, nom Wave, texte), SANS jamais remplacer une valeur déjà présente.
 * Renvoie les champs à écrire et leur liste (pour le journal d'audit).
 */
export function completerDepuisSms(
  existant: Pick<PaiementComparable, "reference" | "telephoneExpediteur" | "nomExpediteur" | "texteBrut">,
  sms: { reference: string | null; telephoneExpediteur: string | null; nomExpediteur: string | null; texteBrut: string },
) {
  const donnees: Partial<Record<"reference" | "telephoneExpediteur" | "nomExpediteur" | "texteBrut", string>> = {};
  if (!existant.reference && sms.reference) donnees.reference = sms.reference;
  if (!existant.telephoneExpediteur && sms.telephoneExpediteur) donnees.telephoneExpediteur = sms.telephoneExpediteur;
  if (!existant.nomExpediteur && sms.nomExpediteur) donnees.nomExpediteur = sms.nomExpediteur;
  if (!existant.texteBrut && sms.texteBrut) donnees.texteBrut = sms.texteBrut;
  return { donnees, champs: Object.keys(donnees) };
}
