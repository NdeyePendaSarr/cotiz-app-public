// Message de relance WhatsApp (lien wa.me). Fonctions pures, testées.

import { formaterDate, formaterFCFA } from "@/lib/format";
import { formaterTelephone, normaliserTelephone } from "@/lib/telephone";

/**
 * Numéro Wave de la trésorière, donné dans les messages par défaut. Variable d'environnement
 * (jamais dans le code) ; NEXT_PUBLIC_ car l'aperçu et la relance construisent le message dans
 * le navigateur. Ce n'est pas un secret : chaque membre relancé le reçoit.
 */
const NUMERO_WAVE_RELANCE = process.env.NEXT_PUBLIC_NUMERO_WAVE_RELANCE ?? "";

/** « Tu peux l'envoyer par Wave au 77 123 45 67. », ou rien si le numéro manque ou est illisible. */
export function phraseEnvoiWave(numeroWave: string) {
  const numero = normaliserTelephone(numeroWave);
  return numero ? ` Tu peux l'envoyer par Wave au ${formaterTelephone(numero)}.` : "";
}

export const BALISES_RELANCE = ["nom", "caisse", "cycle", "montant", "reste", "a_verser", "echeance"] as const;
type Balise = (typeof BALISES_RELANCE)[number];

export type TypeRelance = "TONTINE" | "COLLECTE" | "MENSUALITE";

export type ValeursRelance = {
  nom: string;
  caisse: string;
  cycle: number;
  montant: number;
  reste: number;
  echeance: Date;
  /** Choisit le message par défaut (sans cycle pour une collecte ou une mensualité). Tontine si absent. */
  type?: TypeRelance;
};

/**
 * Message utilisé quand la caisse n'a pas de modèle propre (Caisse.modeleRelance vide). Une
 * collecte n'a qu'un cycle : il n'est pas cité.
 */
export function modeleParDefaut(type: TypeRelance = "TONTINE", numeroWave = NUMERO_WAVE_RELANCE) {
  const envoi = phraseEnvoiWave(numeroWave);
  // Mensualité : {montant} et {reste} portent sur ce qui est dû à ce jour (mois écoulés et mois en cours).
  if (type === "MENSUALITE") return `Bonjour {nom}, petit rappel pour la mensualité « {caisse} » : à ce jour, {a_verser}.${envoi} Merci !`;
  return type === "COLLECTE"
    ? `Bonjour {nom}, petit rappel pour la « {caisse} » : {a_verser}, avant le {echeance}.${envoi} Merci !`
    : `Bonjour {nom}, petit rappel pour la caisse « {caisse} » (cycle {cycle}) : {a_verser}, avant le {echeance}.${envoi} Merci !`;
}

/**
 * « tu dois verser 2 000 FCFA » si rien n'a été versé, sinon « il te reste 1 500 FCFA à verser
 * sur 2 000 FCFA » (demande de la trésorière : ne pas dire « il te reste » à qui n'a rien donné).
 */
export function phraseAVerser(montant: number, reste: number) {
  return reste >= montant ? `tu dois verser ${formaterFCFA(reste)}` : `il te reste ${formaterFCFA(reste)} à verser sur ${formaterFCFA(montant)}`;
}

/**
 * Remplace les balises : {montant} = cotisation, {reste} = reste à verser, {a_verser} = la phrase
 * adaptée (rien versé ou avance), {echeance} = date en toutes lettres. Une balise inconnue est
 * laissée telle quelle (visible dans l'aperçu).
 */
export function construireMessage(modele: string | null | undefined, v: ValeursRelance) {
  const valeurs: Record<Balise, string> = {
    nom: v.nom,
    caisse: v.caisse,
    cycle: String(v.cycle),
    montant: formaterFCFA(v.montant),
    reste: formaterFCFA(v.reste),
    a_verser: phraseAVerser(v.montant, v.reste),
    echeance: formaterDate(v.echeance),
  };
  const texte = modele?.trim() ? modele : modeleParDefaut(v.type);
  return texte.replace(/\{(\w+)\}/g, (balise, nom: string) => ((BALISES_RELANCE as readonly string[]).includes(nom) ? valeurs[nom as Balise] : balise));
}

/** Lien WhatsApp : https://wa.me/221XXXXXXXXX?text=… (numéro sénégalais sur 9 chiffres). */
export function lienWhatsApp(numero: string, message: string) {
  if (!/^\d{9}$/.test(numero)) return null;
  return `https://wa.me/221${numero}?text=${encodeURIComponent(message)}`;
}

/** Relance en série : membres pas à jour qui ont un numéro valide, dans l'ordre donné, sans ceux déjà traités. */
export function fileDeRelance<T extends { membreId: string; aJour: boolean; numeros: string[] }>(lignes: T[], dejaTraites: ReadonlySet<string>) {
  const aRelancer = lignes.filter((l) => !l.aJour && l.numeros.some((n) => /^\d{9}$/.test(n)));
  return {
    total: aRelancer.length,
    restants: aRelancer.filter((l) => !dejaTraites.has(l.membreId)),
    sansNumero: lignes.filter((l) => !l.aJour && !l.numeros.some((n) => /^\d{9}$/.test(n))).length,
  };
}
