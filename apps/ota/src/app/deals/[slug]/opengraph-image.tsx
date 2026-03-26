import { ImageResponse } from "next/og";

import { publicFetch } from "@/lib/api";
import type { Deal } from "@/types/deal";
import { formatPrice } from "@/lib/format";

export const runtime = "edge";
export const alt = "Phoenix Voyages Deal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let deal: Deal | null = null;
  try {
    deal = await publicFetch<Deal>(`/deals/by-slug/${slug}`);
  } catch {
    // Fall through to default OG image
  }

  const title = deal?.title ?? "Travel Deal";
  const supplier = deal?.supplierName ?? "";
  const price =
    deal?.pricing.fromPriceCents != null
      ? `From ${formatPrice(deal.pricing.fromPriceCents)}`
      : "Contact for pricing";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background: "linear-gradient(180deg, #E89E4A 0%, #C59746 40%, #1A1A1A 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top content */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {supplier && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#FFD700",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: 12,
              }}
            >
              {supplier}
            </div>
          )}
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.15,
              maxWidth: 900,
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom row: price + branding */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            {price}
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "rgba(255,255,255,0.6)",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
            }}
          >
            PHOENIX VOYAGES
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
