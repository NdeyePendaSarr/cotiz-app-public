"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Bouton d'un formulaire sans état côté client : désactivé pendant l'envoi, avec un indicateur.
 * Sur un réseau lent, on voit que l'action est partie, et un second appui ne l'envoie pas deux fois.
 */
export function BoutonEnvoi({ children, disabled, ...props }: Omit<ComponentProps<typeof Button>, "type">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}
