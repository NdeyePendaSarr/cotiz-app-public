// SMS fictifs : ils complètent les SMS de format-wave.txt pour les cas qui n'y sont pas.
// Les caractères invisibles sont écrits en clair ( …) pour rester lisibles.

const NBSP = " "; // espace insécable
const NNBSP = " "; // espace fine insécable (fréquente sur iPhone)
const ZWSP = "​"; // espace de largeur nulle (invisible)

// Gabarit d'un SMS de réception, au format réel.
export function smsReception({
  montant = "2.000F",
  recu = "recu",
  ligneDe = "De Moussa Ndiaye (771234567)",
  date = "27/10/2026 à 15h07",
  solde = "Nouveau solde: 9.500F",
  reference = "T4VKYYABCD12K7MOX" as string | null,
} = {}) {
  return [`Vous avez ${recu} ${montant}`, ligneDe, date, solde, "+infos: 200600", "Avec WDF", reference]
    .filter((ligne) => ligne !== null)
    .join("\n");
}

export const FICTIFS = {
  // Cas 2 du cahier : nom en minuscules, numéro renvoyé à la ligne suivante.
  numeroALaLigne: smsReception({ ligneDe: "De moussa ndiaye\n(771234567)" }),

  // Cas 3 : petits et grands montants.
  montant500: smsReception({ montant: "500F" }),
  montant25000: smsReception({ montant: "25.000F" }),
  montant1250000: smsReception({ montant: "1.250.000F" }),

  // Cas 4 : copier-coller depuis iPhone. Mêmes données que le SMS réel n° 1.
  iphone: [
    `${ZWSP}  Vous${NBSP}avez recu${NNBSP}2.000F  `,
    "",
    `De${NBSP}${NBSP}Coumba   Faye${NBSP}(781112233)`,
    "   ",
    `23/09/2026${NNBSP}à 13h55\t`,
    `Nouveau${NBSP}solde: 40.100F`,
    "",
    "+infos: 200600",
    `Avec${NBSP}WDF`,
    `  UB3LD64CZ8BF8CIT1${ZWSP}  `,
    "",
  ].join("\r\n"),

  // Cédille et « a » sans accent.
  avecCedille: smsReception({ recu: "reçu" }),
  aSansAccent: smsReception({ date: "27/10/2026 a 15h07" }),

  // Numéros avec indicatif ou espaces.
  numeroPlus221: smsReception({ ligneDe: "De Moussa Ndiaye (+221771234567)" }),
  numero00221: smsReception({ ligneDe: "De Moussa Ndiaye (00221 77 123 45 67)" }),
  numeroEspaces: smsReception({ ligneDe: "De Moussa Ndiaye (77 123 45 67)" }),

  // Champs facultatifs manquants : ok: true, champ à null.
  sansReference: smsReception({ reference: null }),
  numeroHuitChiffres: smsReception({ ligneDe: "De Moussa Ndiaye (77123456)" }),
  sansNumero: smsReception({ ligneDe: "De Moussa Ndiaye" }),
  sansLigneDe: smsReception({ ligneDe: "" }),

  // Champs obligatoires manquants ou invalides : ok: false.
  sansDate: smsReception({ date: "" }),
  dateImpossible: smsReception({ date: "31/02/2026 à 15h07" }),
  heureImpossible: smsReception({ date: "27/10/2026 à 25h70" }),
  montantNul: smsReception({ montant: "0F" }),
  montantIllisible: smsReception({ montant: "deux mille F" }),

  // Ce ne sont pas des réceptions : ok: false.
  envoi: [
    "Vous avez envoyé 2.000F à Moussa Ndiaye (771234567)",
    "27/10/2026 à 15h07",
    "Nouveau solde: 7.500F",
    "T4VKYYABCD12K7MOX",
  ].join("\n"),
  retrait: [
    "Retrait de 10.000F effectué chez l'agent Boutique Exemple",
    "27/10/2026 à 15h07",
    "Nouveau solde: 7.500F",
    "T4VKYYABCD12K7MOX",
  ].join("\n"),
  paiementMarchand: [
    "Vous avez payé 3.500F à Boutique Exemple",
    "27/10/2026 à 15h07",
    "Nouveau solde: 4.000F",
    "T4VKYYABCD12K7MOX",
  ].join("\n"),
  messageWhatsApp: "Salut, j'ai envoyé ma cotisation hier soir, tu as bien reçu ?",
  vide: "",
  espacesSeulement: `  \n ${NBSP} \r\n\t `,
} as const;
