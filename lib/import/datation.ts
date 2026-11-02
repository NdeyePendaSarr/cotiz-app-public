// Rattrapage (après un import) : dater un versé repris de la liste avec le SMS ignoré qui était
// le même argent. Pur (aucune base), testé ; la Server Action revérifie tout avant d'écrire.

export type RepriseADater = { id: string; personneId: string; montant: number };
export type SmsIgnore = { id: string; personneId: string | null; montant: number; dateReception: Date };
export type Datation = { repriseId: string; smsIds: string[]; date: Date };

/**
 * Pour chaque personne qui a UN seul versé repris non daté :
 * 1. un seul SMS ignoré du même montant → sa date ;
 * 2. sinon, si tous ses SMS ignorés additionnés font le montant (ex. 1 000 + 1 000 pour 2 000)
 *    → la date du dernier (le jour où elle a fini de payer).
 * Tout autre cas (plusieurs versés, plusieurs SMS du même montant, montants qui ne collent pas)
 * est laissé tel quel : on ne devine pas.
 */
export function apparierReprises(reprises: RepriseADater[], sms: SmsIgnore[]): Datation[] {
  const reprisesParPersonne = grouper(reprises, (r) => r.personneId);
  const smsParPersonne = grouper(
    sms.filter((s): s is SmsIgnore & { personneId: string } => s.personneId !== null),
    (s) => s.personneId,
  );

  const datations: Datation[] = [];
  for (const [personneId, siennes] of reprisesParPersonne) {
    if (siennes.length !== 1) continue;
    const [reprise] = siennes;
    const candidats = (smsParPersonne.get(personneId) ?? []).sort((a, b) => a.dateReception.getTime() - b.dateReception.getTime());
    if (candidats.length === 0) continue;

    const exacts = candidats.filter((s) => s.montant === reprise.montant);
    if (exacts.length === 1) {
      datations.push({ repriseId: reprise.id, smsIds: [exacts[0].id], date: exacts[0].dateReception });
    } else if (exacts.length === 0 && candidats.reduce((t, s) => t + s.montant, 0) === reprise.montant) {
      datations.push({ repriseId: reprise.id, smsIds: candidats.map((s) => s.id), date: candidats[candidats.length - 1].dateReception });
    }
  }
  return datations;
}

function grouper<T>(liste: T[], cle: (x: T) => string) {
  const groupes = new Map<string, T[]>();
  for (const x of liste) groupes.set(cle(x), [...(groupes.get(cle(x)) ?? []), x]);
  return groupes;
}
