"use client";

/**
 * Dernier recours : erreur dans la mise en page racine (audit, lot 1). Next l'affiche à la place de
 * tout le document, sans les styles de l'application : d'où des styles en ligne, simples et lisibles.
 */
export default function ErreurGlobale({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f0e6", color: "#17201f" }}>
        <title>Erreur · Cotiz</title>
        <main style={{ maxWidth: 420, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Cotiz ne répond pas</h1>
          <p>Un problème empêche l&apos;application de s&apos;afficher. Rien n&apos;a été perdu : réessaie dans un instant.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 14, background: "#0f5e59", color: "#fffdf8", fontSize: 16, cursor: "pointer" }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
