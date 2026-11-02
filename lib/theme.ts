// Apparence (lot C de la version ordinateur) : clair, sombre ou automatique (réglage du téléphone
// ou de l'ordinateur). Une préférence de cet appareil seulement : stockage du navigateur, clair par défaut.

export type Theme = "clair" | "sombre" | "auto";

export const THEMES: Record<Theme, string> = { clair: "Clair", sombre: "Sombre", auto: "Automatique" };

export const CLE_THEME = "cotiz:theme";

/**
 * Script lancé dans <head> avant l'affichage : pose la classe `dark` sans flash de page claire.
 * En « auto », suit aussi un changement du réglage du système pendant que la page est ouverte.
 */
export const SCRIPT_THEME = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var t=localStorage.getItem("${CLE_THEME}")||"clair";var d=t==="sombre"||(t==="auto"&&m.matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"};a();m.addEventListener("change",a)}catch(e){}})()`;
