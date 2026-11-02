// Numéros sénégalais stockés sur 9 chiffres, sans indicatif (NumeroPersonne.numero : VarChar(9)).

/** « +221 77 123 45 67 », « 00221771234567 », « 77-123-45-67 » → « 771234567 ». Sinon null. */
export function normaliserTelephone(brut: string): string | null {
  if (typeof brut !== "string") return null;
  const chiffres = brut.replace(/[^\d+]/g, "").replace(/^(?:\+221|00221|221(?=\d{9}$))/, "");
  return /^\d{9}$/.test(chiffres) ? chiffres : null;
}

/** « 771234567 » → « 77 123 45 67 », plus lisible à l'écran. */
export function formaterTelephone(numero: string) {
  return /^\d{9}$/.test(numero) ? numero.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3 $4") : numero;
}
