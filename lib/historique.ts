import { formaterFCFA } from "@/lib/format";

// Traduit une ligne du journal d'audit en phrase lisible pour l'historique d'un paiement.
// Logique pure (aucune base) : les clés de `details` sont celles écrites par les Server Actions.

export type LigneJournal = { entite: string; entiteId: string; action: string; details: unknown };

const NOMS_CHAMPS: Record<string, string> = {
  reference: "référence",
  telephoneExpediteur: "numéro",
  nomExpediteur: "nom Wave",
  texteBrut: "texte du SMS",
};

const STATUTS: Record<string, string> = { IGNORE: "Ignoré (sans rapport avec les tontines)", A_RAPPROCHER: "Remis à rapprocher" };

function lire(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
}

const montant = (v: unknown) => (typeof v === "number" ? formaterFCFA(v) : "");

/**
 * @param echeances libellé de chaque échéance (« Tontine Liberté, cycle 3 »), par id ;
 *   l'id d'une allocation dans le journal est « paiementId:echeanceId ».
 */
export function decrireLigne(ligne: LigneJournal, echeances: ReadonlyMap<string, string> = new Map()): string {
  const d = lire(ligne.details);

  if (ligne.entite === "Allocation") {
    const echeance = echeances.get(ligne.entiteId.split(":")[1] ?? "") ?? "une échéance";
    if (ligne.action === "CREATION") return `Réparti sur ${echeance} : ${montant(d.montant)}`;
    if (ligne.action === "SUPPRESSION") return `Répartition annulée sur ${echeance} : ${montant(d.montant)}`;
  }

  if (ligne.entite === "Paiement") {
    if (ligne.action === "CREATION") {
      if (d.source === "SMS_WAVE") return "Enregistré depuis un SMS Wave";
      if (d.source === "REPRISE_IMPORT") return "Repris d'une liste importée (déjà versé)";
      return "Enregistré par saisie manuelle";
    }
    if (ligne.action === "COMPLETION") {
      const champs = Array.isArray(d.champs) ? d.champs.map((c) => NOMS_CHAMPS[String(c)] ?? String(c)) : [];
      return champs.length > 0 ? `Complété depuis un SMS (${champs.join(", ")})` : "Complété depuis un SMS";
    }
    if (ligne.action === "MODIFICATION") {
      if (d.rapprochement) return typeof d.excedent === "number" && d.excedent > 0 ? `Rapproché, excédent de ${montant(d.excedent)}` : "Rapproché";
      if (d.annulationRapprochement) return "Rapprochement annulé : de nouveau à rapprocher";
      if (typeof d.rembourse === "number") return `Excédent remboursé : ${montant(d.rembourse)}`;
      if (typeof d.statut === "string" && STATUTS[d.statut]) return STATUTS[d.statut];
    }
  }

  return `${ligne.entite} : ${ligne.action.toLowerCase()}`;
}
