// apps/ota/src/components/hub/sections/destination-info-section.tsx

import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function DestinationInfoSection({
  title,
  sectionProps,
}: SectionComponentProps) {
  const metadata = sectionProps.metadata as Record<string, unknown> | undefined
  if (!metadata) return null

  const currency = metadata.currencyName as string | undefined
  const languages = metadata.languages as string[] | undefined
  const visaInfo = metadata.visaInfo as string | undefined
  const climateZone = metadata.climateZone as string | undefined
  const bestMonths = metadata.bestMonths as string[] | undefined
  const typicalStay = metadata.typicalStay as string | undefined
  const budgetTier = metadata.budgetTier as string | undefined
  const travelTips = metadata.travelTips as string[] | undefined
  const highlights = metadata.highlights as string[] | undefined

  // Only render if we have meaningful data
  const hasInfo = currency || languages?.length || bestMonths?.length || travelTips?.length
  if (!hasInfo) return null

  return (
    <FeedSection title={title}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Quick Facts Card */}
        <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">Quick Facts</h3>
          <dl className="space-y-2 text-sm">
            {currency && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Currency</dt>
                <dd className="font-medium text-[#1A1A1A]">{currency}</dd>
              </div>
            )}
            {languages && languages.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Language</dt>
                <dd className="font-medium text-[#1A1A1A]">{languages.join(', ')}</dd>
              </div>
            )}
            {visaInfo && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Visa (CA)</dt>
                <dd className="font-medium text-[#1A1A1A]">{visaInfo}</dd>
              </div>
            )}
            {budgetTier && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Budget</dt>
                <dd className="font-medium text-[#C59746] capitalize">{budgetTier}</dd>
              </div>
            )}
            {typicalStay && (
              <div className="flex justify-between">
                <dt className="text-[#888]">Typical stay</dt>
                <dd className="font-medium text-[#1A1A1A]">{typicalStay}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Best Time to Visit */}
        {bestMonths && bestMonths.length > 0 && (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">Best Time to Visit</h3>
            <div className="flex flex-wrap gap-1.5">
              {bestMonths.map((month) => (
                <span key={month} className="rounded-full bg-[#C59746]/10 px-2.5 py-1 text-xs font-medium text-[#C59746]">
                  {month}
                </span>
              ))}
            </div>
            {climateZone && (
              <p className="mt-3 text-xs text-[#888] capitalize">Climate: {climateZone}</p>
            )}
          </div>
        )}

        {/* Travel Tips */}
        {travelTips && travelTips.length > 0 && (
          <div className="rounded-xl border border-[#E0E0E0] bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <h3 className="mb-3 text-sm font-bold text-[#1A1A1A]">Insider Tips</h3>
            <ul className="space-y-2">
              {travelTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-[#1A1A1A]">
                  <span className="mt-0.5 shrink-0 text-[#C59746]">&bull;</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Highlights */}
      {highlights && highlights.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {highlights.map((h, i) => (
            <span key={i} className="rounded-full border border-[#E0E0E0] bg-[#faf6f0] px-3 py-1.5 text-xs font-medium text-[#1A1A1A]">
              {h}
            </span>
          ))}
        </div>
      )}
    </FeedSection>
  )
}
