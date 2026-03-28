import { SafeImage } from '@/components/hub/safe-image'

interface PhotoMosaicProps {
  photos: Array<{ url: string; caption?: string }>
  totalCount: number
}

export function PhotoMosaic({ photos, totalCount }: PhotoMosaicProps) {
  if (photos.length === 0) return null
  const display = photos.slice(0, 5)
  const remaining = totalCount - display.length

  return (
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-2xl sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-2">
      {display.map((photo, i) => (
        <div
          key={i}
          className={`relative overflow-hidden ${
            i === 0 ? 'col-span-2 row-span-1 h-48 sm:col-span-1 sm:row-span-2 sm:h-auto' : 'h-24 sm:h-auto'
          }`}
        >
          <SafeImage
            src={photo.url}
            alt={photo.caption || 'Photo'}
            fill
            className="object-cover"
            sizes={i === 0 ? '50vw' : '25vw'}
            hideOnError
          />
          {i === display.length - 1 && remaining > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-base font-semibold text-white sm:text-lg">
              +{remaining} more
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
