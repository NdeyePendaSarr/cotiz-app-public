import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Sora } from "next/font/google";
import { SCRIPT_THEME } from "@/lib/theme";
import "./globals.css";

// Identité (lot 1) : Inter pour le texte et les tableaux, Sora pour les titres et les grands montants.
// next/font les héberge avec le site (aucune requête vers Google côté navigateur,
// compatible avec la CSP « font-src 'self' »).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cotiz",
  description: "Suivi des cotisations de tontines",
};

// viewport-fit=cover : la page occupe tout l'écran de l'iPhone, et env(safe-area-inset-*)
// donne la place réservée à l'encoche et à la barre d'accueil (utilisé par la barre de capture).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Barre d'état de Safari et de Chrome mobile aux couleurs de l'en-tête.
  themeColor: "#0b3b39",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning : le script d'apparence ajoute la classe `dark` avant React.
    <html
      lang="fr"
      className={`${inter.variable} ${sora.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
