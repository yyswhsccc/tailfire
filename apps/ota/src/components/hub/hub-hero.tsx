import { SafeImage } from './safe-image'
import { HubBackButton } from './hub-back-button'

interface HubHeroProps {
  title: string
  badge?: string
  subtitle?: string
  imageUrl?: string | null
  children?: React.ReactNode
  urgencyBadge?: string
}

export function HubHero({ title, badge, subtitle, imageUrl, children, urgencyBadge }: HubHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {imageUrl && (
        <SafeImage src={imageUrl} alt={title} fill className="object-cover" sizes="100vw" priority hideOnError />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
      <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-4 sm:px-10 sm:pt-5">
        <HubBackButton />
      </div>
      <div className="relative mx-auto max-w-[1280px] px-4 pb-8 pt-48 sm:px-10 sm:pb-10 sm:pt-56 lg:px-[60px] lg:pb-10 lg:pt-64">
        {urgencyBadge && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
            {urgencyBadge}
          </span>
        )}
        {badge && (
          <p className="text-xs font-semibold uppercase tracking-[3px] text-[#C59746] [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            {badge}
          </p>
        )}
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-4xl lg:text-[56px] lg:leading-[1.05]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] sm:text-base">{subtitle}</p>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}
