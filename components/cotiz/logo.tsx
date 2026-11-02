import { cn } from "@/lib/utils";

/**
 * Monogramme Cotiz : un cercle ouvert (le C, et le tour de la tontine) et un point or
 * (celle qui reçoit la cagnotte ce tour-ci). Le cercle prend la couleur du texte.
 */
export function Monogramme({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-7 shrink-0", className)}>
      <path d="M71.2 28.8 A30 30 0 1 0 71.2 71.2" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
      <circle cx="82" cy="50" r="9" className="fill-or" />
    </svg>
  );
}

/** Monogramme + nom, en minuscules (Sora). La taille suit celle du texte du parent. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-heading font-bold tracking-tight", className)}>
      <Monogramme className="size-[1.3em]" />
      cotiz
    </span>
  );
}
