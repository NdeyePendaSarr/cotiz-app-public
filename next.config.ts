import type { NextConfig } from "next";

// Politique de sécurité du contenu (CSP), sans nonce : le navigateur ne charge que des
// ressources du site lui-même. Aucun appel direct à Supabase depuis le navigateur
// (connexion par Server Action), donc pas d'autre origine à autoriser.
// 'unsafe-inline' pour les scripts : nécessaire au rendu de Next sans nonce (une CSP à
// nonce imposerait un rendu dynamique de chaque page). Production seulement : en dev,
// le rechargement à chaud a besoin d'eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const ENTETES_SECURITE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Le presse-papiers (bouton « Coller ») n'est pas restreint ici.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: CSP }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Développement seulement : autorise un téléphone du même Wi-Fi (adresse 192.168.x.x)
  // à charger les ressources du serveur de dev. Sans effet en production.
  allowedDevOrigins: ["192.168.*.*"],
  partialPrefetching: true,
  experimental: {
    // Performance (31/10/2026) : une page déjà vue reste dans le cache du navigateur 30 s ;
    // y revenir (onglets d'une caisse, aller-retour) ne redemande rien au serveur. Après une
    // Server Action, refresh() / redirect() rechargent les données : rien de périmé après une saisie.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [{ source: "/(.*)", headers: ENTETES_SECURITE }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
