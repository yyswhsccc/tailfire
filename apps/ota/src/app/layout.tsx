import type { Metadata } from "next";
import type { ReactNode } from "react";

import { cinzel, lato } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Phoenix Voyages",
  description: "Luxury travel experiences curated with Phoenix Voyages.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${lato.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
