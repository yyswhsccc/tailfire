import type { Metadata } from "next";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";

import { cinzel, lato } from "@/lib/fonts";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const ChatWidget = dynamic(() => import("@/components/chat/chat-widget"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Phoenix Voyages",
  description: "Luxury travel experiences curated with Phoenix Voyages.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${lato.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        <Nav />
        <main>{children}</main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
