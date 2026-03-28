import Link from 'next/link'
import { SafeImage } from '@/components/hub/safe-image'

interface NearbyItem {
  slug: string
  href: string
  name: string
  imageUrl: string | null
  subtitle: string
}

interface NearbyScrollProps {
  title: string
  viewAllHref?: string
  items: NearbyItem[]
}

export function NearbyScroll({ title, viewAllHref, items }: NearbyScrollProps) {
  if (items.length === 0) return null

  return (
    <div className="bg-[#f4f3f0] px-4 py-10 sm:px-10 lg:px-[60px]">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-[#1A1A1A] sm:text-xl">{title}</h2>
          {viewAllHref && (
            <Link href={viewAllHref} className="text-sm font-medium text-[#C59746] hover:underline">View all →</Link>
          )}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((item) => (
            <Link
              key={item.slug}
              href={item.href}
              className="group w-48 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg sm:w-52"
            >
              <div className="relative h-28 overflow-hidden sm:h-32">
                {item.imageUrl ? (
                  <SafeImage src={item.imageUrl} alt={item.name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" sizes="200px" hideOnError />
                ) : (
                  <div className="h-full bg-gradient-to-br from-[#e8e8e8] to-[#d8d8d8]" />
                )}
              </div>
              <div className="p-3">
                <h4 className="text-sm font-semibold text-[#1A1A1A]">{item.name}</h4>
                <p className="text-[11px] text-[#888]">{item.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
