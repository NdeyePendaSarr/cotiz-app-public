import type { Metadata } from "next";
import { PageIntrouvable } from "@/components/cotiz/page-introuvable";

export const metadata: Metadata = { title: "Page introuvable · Cotiz" };

// notFound() dans une page privée (caisse d'un autre compte, identifiant invalide) : la navigation reste.
export default function NonTrouveePrivee() {
  return <PageIntrouvable />;
}
