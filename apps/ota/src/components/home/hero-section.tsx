import { Send } from "lucide-react";

export function HeroSection() {
  return (
    <section className="px-4 py-16 text-center md:py-24">
      <div className="mx-auto max-w-2xl">
        {/* Tagline */}
        <p className="font-display text-xs font-bold uppercase tracking-[3px] text-[#C59746]">
          Discover, Soar, Repeat
        </p>

        {/* Main heading */}
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-5xl">
          Your Journey Starts Here
        </h1>

        {/* Subtitle */}
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          AI-powered travel planning backed by expert advisors
        </p>

        {/* AI chat input mock */}
        <div className="mt-10">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-[#1A1A1A] px-5 py-4">
            {/* Pulsing gold dot */}
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C59746] opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-[#C59746]" />
            </span>

            {/* Placeholder text */}
            <span className="flex-1 text-left text-sm text-gray-400 md:text-base">
              Tell me about your dream trip...
            </span>

            {/* Send button */}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white">
              <Send className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
