"use client";

import { useState } from "react";
import { X, Loader2, Mail, CheckCircle } from "lucide-react";

export type EmailCaptureTrigger = "save_board" | "submit_trip" | "ai_chat";

interface EmailCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string) => void;
  trigger?: EmailCaptureTrigger;
  title?: string;
  subtitle?: string;
}

function parseCookies(): Record<string, string> {
  if (typeof document === "undefined") return {};
  return document.cookie.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [key, ...rest] = pair.split("=");
    if (key) acc[key.trim()] = decodeURIComponent(rest.join("=").trim());
    return acc;
  }, {});
}

export function EmailCaptureModal({
  isOpen,
  onClose,
  onSuccess,
  trigger = "save_board",
  title,
  subtitle,
}: EmailCaptureModalProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const defaultTitle =
    trigger === "submit_trip"
      ? "Almost there!"
      : trigger === "ai_chat"
        ? "Start chatting"
        : "Save your board";

  const defaultSubtitle =
    trigger === "submit_trip"
      ? "Enter your email to submit your trip request. We'll send you updates."
      : trigger === "ai_chat"
        ? "Enter your email to start a conversation with our AI travel concierge."
        : "Enter your email so we can save your dream board and send it to you.";

  const modalTitle = title ?? defaultTitle;
  const modalSubtitle = subtitle ?? defaultSubtitle;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setLoading(true);
    try {
      const cookies = parseCookies();
      const otaSession = cookies["ota_session"] ?? null;
      const otaRef = cookies["ota_ref"] ?? null;

      const res = await fetch("/api/consumer-auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          sessionId: otaSession,
          advisorSlug: otaRef,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data?.message ||
            "Something went wrong. Please try again.",
        );
        return;
      }

      setSuccess(true);
      onSuccess(email.trim());
    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-[#888] transition-colors hover:bg-gray-100 hover:text-[#1A1A1A]"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        {success ? (
          /* Success state */
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#C59746]/10">
              <CheckCircle className="size-8 text-[#C59746]" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-[#1A1A1A]">You&apos;re all set!</h2>
            <p className="text-[#555]">
              Your account has been created! You can sign in at any time to access your saved trip ideas.
            </p>
            <a
              href="https://my.phoenixvoyages.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B08638]"
            >
              Sign in to portal
            </a>
            <button
              onClick={onClose}
              className="mt-2 text-sm text-[#888] underline transition-colors hover:text-[#555]"
            >
              Continue browsing
            </button>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C59746]/10">
                <Mail className="size-6 text-[#C59746]" />
              </div>
              <h2 className="text-xl font-semibold text-[#1A1A1A]">{modalTitle}</h2>
              <p className="mt-1.5 text-sm text-[#555]">{modalSubtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* First name (optional) */}
              <div>
                <label htmlFor="ec-first-name" className="mb-1 block text-sm font-medium text-[#1A1A1A]">
                  First name <span className="text-[#888] font-normal">(optional)</span>
                </label>
                <input
                  id="ec-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  autoComplete="given-name"
                  className="w-full rounded-lg border border-[#E0E0E0] px-4 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#BBB] focus:border-[#C59746] focus:ring-2 focus:ring-[#C59746]/20"
                />
              </div>

              {/* Email (required) */}
              <div>
                <label htmlFor="ec-email" className="mb-1 block text-sm font-medium text-[#1A1A1A]">
                  Email address <span className="text-[#C59746]">*</span>
                </label>
                <input
                  id="ec-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-[#E0E0E0] px-4 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#BBB] focus:border-[#C59746] focus:ring-2 focus:ring-[#C59746]/20"
                />
              </div>

              {/* Error message */}
              {error && (
                <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C59746] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Continue"
                )}
              </button>

              <p className="text-center text-xs text-[#888]">
                No password required — sign in via the portal.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
