import Image from 'next/image'

interface EntityHeroProps {
  title: string
  subtitle?: string
  imageUrl?: string | null
  badge?: string
  children?: React.ReactNode
}

export function EntityHero({ title, subtitle, imageUrl, badge, children }: EntityHeroProps) {
  return (
    <div className="relative overflow-hidden bg-[#1A1A1A]">
      {imageUrl && (
        <Image
          src={imageUrl}
          alt={title}
          fill
          className="object-cover opacity-40"
          sizes="100vw"
          priority
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-[#1A1A1A]/60 to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8 lg:pb-14 lg:pt-32">
        {badge && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-[#C59746]">
            {badge}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight text-white md:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-base text-white/70 md:text-lg">{subtitle}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}
