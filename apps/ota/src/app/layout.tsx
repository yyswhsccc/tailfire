import type { Metadata } from "next";
import type { ReactNode } from "react";

import { cinzel, lato } from "@/lib/fonts";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { ChatWidgetLoader } from "@/components/chat/chat-widget-loader";
import { TripBasketProvider } from "@/components/trip-builder/trip-basket-provider";
import { generateOrganizationJsonLd, generateSearchActionJsonLd } from "@/lib/structured-data";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ota.phoenixvoyages.ca";
const OG_IMAGE = "https://cdn.tailfire.ca/photos/og/phoenix-voyages/cover_image_fb_og.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Phoenix Voyages | Luxury Travel Experts",
    template: "%s | Phoenix Voyages",
  },
  description:
    "Phoenix Voyages is a TICO-registered Canadian travel agency specializing in cruises, all-inclusives, and custom luxury travel. Book with a trusted advisor.",
  applicationName: "Phoenix Voyages",
  openGraph: {
    type: "website",
    siteName: "Phoenix Voyages",
    title: "Phoenix Voyages | Luxury Travel Experts",
    description:
      "Phoenix Voyages is a TICO-registered Canadian travel agency specializing in cruises, all-inclusives, and custom luxury travel. Book with a trusted advisor.",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Phoenix Voyages",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Phoenix Voyages | Luxury Travel Experts",
    description:
      "Phoenix Voyages is a TICO-registered Canadian travel agency specializing in cruises, all-inclusives, and custom luxury travel. Book with a trusted advisor.",
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const organizationJsonLd = generateOrganizationJsonLd();
  const searchActionJsonLd = generateSearchActionJsonLd();

  return (
    <html lang="en" className={`${cinzel.variable} ${lato.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(searchActionJsonLd) }}
        />
        <TripBasketProvider>
          <Nav />
          <main>{children}</main>
          <Footer />
          <ChatWidgetLoader />
        </TripBasketProvider>
      </body>
    </html>
  );
}
