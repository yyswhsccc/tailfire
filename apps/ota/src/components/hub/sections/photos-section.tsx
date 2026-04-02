// apps/ota/src/components/hub/sections/photos-section.tsx

import Image from 'next/image'
import { FeedSection } from '@/components/hub/feed-section'
import type { SectionComponentProps } from '@/lib/entity-hubs/types'

export async function PhotosSection({
  title,
  sectionProps,
}: SectionComponentProps) {
  const photos = (sectionProps.photos as any[]) ?? []
  if (photos.length === 0) return null

  return (
    <FeedSection title={title}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.slice(0, 6).map((p: any, i: number) => (
          <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-xl">
            <Image
              src={p.url}
              alt={p.caption || 'Photo'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </FeedSection>
  )
}
