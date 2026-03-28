import { FeedSection } from '@/components/hub/feed-section'
import { PhotoMosaic } from '@/components/hub/cards/photo-mosaic'

interface Props {
  photos: Array<{ url: string; caption?: string }>
}

export function PhotosSection({ photos }: Props) {
  if (photos.length === 0) return null
  return (
    <FeedSection title={`\uD83D\uDCF8 Photos`}>
      <PhotoMosaic photos={photos} totalCount={photos.length} />
    </FeedSection>
  )
}
