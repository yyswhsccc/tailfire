import type { AdvisorProfile } from "@/types/advisor";

interface AdvisorDestinationsProps {
  advisor: AdvisorProfile;
}

/**
 * Gradient palette for destination cards. Cycles through variations
 * of golden, blue, and green to match the brand palette.
 */
const DESTINATION_GRADIENTS = [
  "from-[#C59746] to-[#E89E4A]", // golden
  "from-[#2C5F7C] to-[#4A9BB5]", // blue
  "from-[#3A6B52] to-[#5C9B7A]", // green
  "from-[#8B5E3C] to-[#C49063]", // warm brown
  "from-[#5A4B8A] to-[#8A7CB8]", // muted purple
  "from-[#7C6B40] to-[#B89E60]", // olive gold
] as const;

export function AdvisorDestinations({ advisor }: AdvisorDestinationsProps) {
  if (!advisor.destinations || advisor.destinations.length === 0) return null;

  return (
    <section className="pb-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-[#1A1A1A]">
          Destination Expertise
        </h2>
      </div>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="mt-4 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-x-visible sm:px-0 sm:pb-0">
            {advisor.destinations.map((destination, index) => (
              <div
                key={destination}
                className={`flex min-w-[140px] shrink-0 items-end rounded-xl bg-gradient-to-br ${DESTINATION_GRADIENTS[index % DESTINATION_GRADIENTS.length]} p-4 sm:min-w-0`}
                style={{ minHeight: 100 }}
              >
                <span className="text-sm font-semibold text-white drop-shadow-sm">
                  {destination}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
