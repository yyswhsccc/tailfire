import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Lato } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Phoenix Voyages brand fonts — Cinzel (display) + Lato (body)
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "700", "900"],
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Portal | Phoenix Voyages",
  description: "Manage your trips, documents, and travel profile with Phoenix Voyages.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${lato.variable}`}>
      <body className={`${cinzel.variable} ${lato.variable} font-sans antialiased bg-phoenix-charcoal min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
