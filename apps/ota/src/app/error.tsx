"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

import phoenixLogo from "@/assets/phoenix-logo.svg";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Phoenix Voyages] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-white px-4 py-16 text-center">
      {/* Logo */}
      <Image
        src={phoenixLogo}
        alt="Phoenix Voyages"
        width={56}
        height={56}
        className="mb-6 h-14 w-14 opacity-80"
      />

      {/* Heading */}
      <h1 className="font-display text-3xl font-bold text-[#1A1A1A] md:text-4xl">
        Something went wrong
      </h1>

      {/* Subtext */}
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        We&apos;re sorry, but something unexpected happened. Please try again.
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#C59746] px-6 text-sm font-medium text-white transition-colors hover:bg-[#B08638]"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
