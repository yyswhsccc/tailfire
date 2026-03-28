import Link from 'next/link'

interface FeedSectionProps {
  title: string
  viewAllHref?: string
  viewAllLabel?: string
  subtitle?: string
  children: React.ReactNode
}

export function FeedSection({ title, viewAllHref, viewAllLabel, subtitle, children }: FeedSectionProps) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-10 lg:px-[60px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[#1A1A1A] sm:text-xl">{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm font-medium text-[#C59746] hover:underline">
            {viewAllLabel || 'View all →'}
          </Link>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-[#888] sm:text-sm">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}
