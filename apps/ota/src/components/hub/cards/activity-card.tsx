interface ActivityCardProps {
  title: string
  rating?: number
  description?: string
}

export function ActivityCard({ title, rating, description }: ActivityCardProps) {
  return (
    <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>
      {rating != null && rating > 0 && (
        <p className="mt-1 text-xs text-[#C59746]">{'★'.repeat(Math.round(rating))} {rating.toFixed(1)}</p>
      )}
      {description && (
        <p className="mt-1.5 line-clamp-2 text-xs text-[#888]">{description}</p>
      )}
    </div>
  )
}
