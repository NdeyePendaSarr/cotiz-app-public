import type { Metadata } from "next";
import { Section } from "@/components/cotiz/section";
import { BOUTON_EN_TETE, EnTete } from "@/components/cotiz/en-tete";
import { PenLine } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { exigerUtilisatrice } from "@/lib/auth";
import { derniersPaiements } from "@/lib/donnees/paiements";
import { CaptureSms } from "./capture-sms";
import { CartePaiement } from "./carte-paiement";

export const metadata: Metadata = { title: "Coller un SMS · Cotiz" };

// Capturer en 10 secondes : la page s'ouvre sur le champ, prêt à recevoir le SMS.
export default function PageCapture() {
  return (
    <>
      <EnTete titre="Coller un SMS" surtitre="Wave">
        <p className="text-sm text-nuit-doux">Colle le SMS reçu : montant, nom, numéro et référence sont lus tout seuls.</p>
        <Link href="/capture/manuelle" className={BOUTON_EN_TETE}>
          <PenLine aria-hidden />
          Saisie manuelle
        </Link>
      </EnTete>
      <CaptureSms />
      <Suspense fallback={null}>
        <Derniers />
      </Suspense>
    </>
  );
}

async function Derniers() {
  const { id: ownerId } = await exigerUtilisatrice();
  const paiements = await derniersPaiements(ownerId);
  if (paiements.length === 0) return null;
  return (
    <Section titre="Derniers paiements capturés">
      {paiements.map((p) => (
        <CartePaiement
          lienHistorique
          key={p.id}
          paiement={{ ...p, dateReception: p.dateReception.toISOString(), personne: p.personne?.nomComplet ?? null }}
        />
      ))}
    </Section>
  );
}
