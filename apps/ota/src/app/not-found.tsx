import Link from "next/link";
import Image from "next/image";

import phoenixLogo from "@/assets/phoenix-logo.svg";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-white px-4 py-16 text-center">
      {/* Logo */}
      <Image
        src={phoenixLogo}
        alt="Phoenix Voyages"
        width={56}
        height={56}
        className="mb-6 h-14 w-14 opacity-60"
      />

      {/* 404 label */}
      <p className="text-xs font-bold uppercase tracking-widest text-[#C59746]">
        404 — Page Not Found
      </p>

      {/* Heading */}
      <h1 className="mt-3 font-display text-3xl font-bold text-[#1A1A1A] md:text-4xl">
        Page Not Found
      </h1>

      {/* Subtext */}
      <p className="mt-4 max-w-md text-base text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-[#C59746] px-6 text-sm font-medium text-white transition-colors hover:bg-[#B08638]"
        >
          Go Home
        </Link>
        <Link
          href="/#ai-concierge"
          className="text-sm font-medium text-[#C59746] underline-offset-4 hover:underline"
        >
          Talk to our AI concierge &rarr;
        </Link>
      </div>
    </div>
  );
}
