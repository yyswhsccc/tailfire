import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Defensive guard for external URLs supplied by agents (e.g. activity
 * referralUrl rendered as a CTA). Returns the trimmed URL only when it parses
 * and uses http:/https:; otherwise returns null so legacy or unsafe data
 * (javascript:, data:, file:) cannot produce a clickable link in the portal.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}
