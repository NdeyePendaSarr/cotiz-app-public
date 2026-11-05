import { z } from "zod";

// Schéma du formulaire de connexion. Les comptes sont créés dans Supabase
// (inscription fermée en v0) avec un mot de passe d'au moins 8 caractères.
export const schemaConnexion = z.object({
  email: z
    .string({ error: "Saisis ton adresse e-mail." })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Adresse e-mail invalide." })),
  motDePasse: z
    .string({ error: "Saisis ton mot de passe." })
    .min(8, { error: "Le mot de passe fait au moins 8 caractères." })
    .max(72, { error: "Mot de passe trop long." }),
});


// Nom par défaut d'une utilisatrice créée automatiquement : la partie avant le @.
export function nomDepuisEmail(email: string) {
  const local = email.split("@")[0]?.trim();
  return (local || email).slice(0, 100); // Utilisatrice.nom : VarChar(100)
}

// Nom d'affichage (« Bonjour … », initiales en haut à droite), modifiable dans Mon profil.
export const schemaNomAffichage = z
  .string({ error: "Indique ton prénom." })
  .trim()
  .min(1, { error: "Indique ton prénom." })
  .max(100, { error: "100 caractères maximum." });
