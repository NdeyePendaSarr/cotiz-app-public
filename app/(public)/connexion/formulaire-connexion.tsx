"use client";

import { useActionState } from "react";
import { seConnecter } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          required
          defaultValue={etat?.email}
          aria-invalid={Boolean(etat?.erreur)}
          className="h-11 text-base"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="motDePasse">Mot de passe</Label>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(etat?.erreur)}
          className="h-11 text-base"
        />
      </div>

      {etat?.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}

      <Button type="submit" size="lg" disabled={enCours} className="text-base">
        {enCours ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
