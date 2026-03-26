import { ImageResponse } from "next/og";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";

export const runtime = "edge";

export const alt = "Advisor Profile — Phoenix Voyages";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let advisor: AdvisorProfile | null = null;
  try {
    advisor = await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
    );
  } catch {
    // Fall through to fallback
  }

  const displayName = advisor?.displayName ?? "Travel Advisor";
  const title = advisor?.title ?? "Phoenix Voyages";
  const specialties = advisor?.specialties?.slice(0, 4) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1A1A1A 0%, #2D2317 50%, #3A2A14 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: Avatar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 180,
            height: 180,
            borderRadius: "50%",
            marginRight: 60,
            overflow: "hidden",
            ...(advisor?.photoUrl
              ? {}
              : {
                  background: "linear-gradient(135deg, #C59746, #E89E4A)",
                }),
          }}
        >
          {advisor?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={advisor.photoUrl}
              alt={displayName}
              width={180}
              height={180}
              style={{ objectFit: "cover", width: 180, height: 180 }}
            />
          ) : (
            <span
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "white",
                letterSpacing: 2,
              }}
            >
              {getInitials(displayName)}
            </span>
          )}
        </div>

        {/* Right: Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 700,
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "white",
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </span>

          <span
            style={{
              fontSize: 24,
              color: "#C59746",
              marginTop: 8,
              fontWeight: 500,
            }}
          >
            {title}
          </span>

          {specialties.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 24,
              }}
            >
              {specialties.map((s) => (
                <span
                  key={s}
                  style={{
                    fontSize: 16,
                    color: "rgba(255,255,255,0.8)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: 20,
                    padding: "6px 16px",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Branding */}
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 4,
              color: "#C59746",
              marginTop: 40,
              textTransform: "uppercase" as const,
            }}
          >
            PHOENIX VOYAGES
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
