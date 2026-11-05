import type { Metadata } from "next";
import { PageIntrouvable } from "@/components/cotiz/page-introuvable";

export const metadata: Metadata = { title: "Page introuvable · Cotiz" };

// Adresse inconnue : hors de la navigation de l'application.
export default function NonTrouvee() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <PageIntrouvable />
    </main>
  );
}
