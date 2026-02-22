import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cinzel, Lato } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Client Portal | Phoenix Voyages",
  description: "Manage your trips and documents",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${lato.variable}`}>
      <body className="font-sans antialiased bg-phoenix-charcoal min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
