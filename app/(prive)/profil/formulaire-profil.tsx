"use client";

import { useActionState } from "react";
import { modifierNomAffichage } from "@/app/actions/profil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireProfil({ nom }: { nom: string }) {
  const [etat, envoyer, enCours] = useActionState(modifierNomAffichage, undefined);

  return (
    <form action={envoyer} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Ton prénom (ou le nom à afficher)</Label>
        <Input id="nom" name="nom" defaultValue={etat?.nom ?? nom} maxLength={100} autoComplete="given-name" aria-invalid={Boolean(etat?.erreur)} className="text-base" />
        <p className="text-sm text-muted-foreground">Affiché dans « Bonjour … » sur l&apos;accueil et dans tes initiales, en haut à droite.</p>
      </div>
      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat?.enregistre && (
        <p role="status" className="text-sm font-semibold text-paye">
          Enregistré ✓
        </p>
      )}
      <Button type="submit" disabled={enCours} className="text-base">
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
