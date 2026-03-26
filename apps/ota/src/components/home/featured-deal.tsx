import Link from "next/link";

export function FeaturedDeal() {
  return (
    <section className="px-4 pb-12">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl bg-[#1A1A1A] px-6 py-8 md:px-10">
          {/* Badge */}
          <p className="text-xs font-bold uppercase tracking-wider">
            <span className="text-[#C59746]">Hot</span>
            <span className="text-gray-400"> Deal</span>
          </p>

          {/* Title */}
          <h2 className="mt-3 font-display text-xl font-bold text-white md:text-2xl">
            Caribbean Cruise from $899
          </h2>

          {/* Subtitle */}
          <p className="mt-1 text-sm text-gray-400">
            7 nights &middot; Royal Caribbean
          </p>

          {/* CTA link */}
          <Link
            href="/deals"
            className="mt-5 inline-block text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
          >
            View Deal &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
