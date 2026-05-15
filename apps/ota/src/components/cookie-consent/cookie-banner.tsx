"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * PIPEDA-aware cookie consent banner.
 *
 * Shows on first visit. Saves consent in localStorage so it doesn't show again.
 * Two choices: Accept (allow analytics + marketing) or Decline (essential only).
 *
 * The actual gating of analytics/marketing scripts (e.g., GA, Meta Pixel) should
 * read `localStorage.getItem("pv_cookie_consent")` and only load the SDK when
 * the value is "accepted". Necessary cookies (session, CSRF) are never gated.
 *
 * Reference: Office of the Privacy Commissioner of Canada — Online Privacy,
 * Tracking, and Cookies guidance (https://www.priv.gc.ca/en/privacy-topics/technology/online-privacy-tracking-cookies/).
 */

const STORAGE_KEY = "pv_cookie_consent";
type ConsentValue = "accepted" | "declined";

function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

function writeConsent(value: ConsentValue) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage may be unavailable (private browsing, etc.). Banner will reappear
    // on next visit — acceptable graceful degradation.
  }
}

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readConsent() === null) setOpen(true);
  }, []);

  if (!open) return null;

  const handleAccept = () => {
    writeConsent("accepted");
    setOpen(false);
  };

  const handleDecline = () => {
    writeConsent("declined");
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-body"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-3xl rounded-2xl border border-[#E0E0E0] bg-white p-4 shadow-2xl md:p-6"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h2
            id="cookie-banner-title"
            className="font-display text-base font-bold text-[#1A1A1A]"
          >
            Cookies on phoenixvoyages.ca
          </h2>
          <p id="cookie-banner-body" className="mt-2 text-sm text-[#555]">
            We use cookies and similar technologies to operate this site, analyze how it&apos;s
            used, and improve your experience. Necessary cookies are always on. You can accept
            analytics and marketing cookies, or decline them and continue with only what&apos;s
            essential. See our{" "}
            <Link
              href="/privacy"
              className="font-medium text-[#C59746] underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            {" "}for details.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleAccept}
              className="rounded-lg bg-[#C59746] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-lg border border-[#E0E0E0] bg-white px-5 py-2.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-[#F5F5F5]"
            >
              Necessary only
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDecline}
          className="rounded-full p-1.5 text-[#888] transition-colors hover:bg-gray-100 hover:text-[#1A1A1A]"
          aria-label="Dismiss (use only necessary cookies)"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Read consent state from outside the banner (e.g., to gate analytics SDK init).
 * Returns null on the server.
 */
export function useCookieConsent(): ConsentValue | null {
  const [value, setValue] = useState<ConsentValue | null>(null);
  useEffect(() => {
    setValue(readConsent());
  }, []);
  return value;
}
