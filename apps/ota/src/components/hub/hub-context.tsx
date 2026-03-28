interface HubContextProps {
  description?: string | null
  pills?: Array<{ emoji: string; label: string }>
}

export function HubContext({ description, pills }: HubContextProps) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-10 lg:px-[60px]">
      {description && (
        <p className="max-w-[680px] text-sm leading-relaxed text-[#444] sm:text-base sm:leading-[1.8]">{description}</p>
      )}
      {pills && pills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pills.map((pill, i) => (
            <span key={i} className="rounded-2xl border border-[#eee] bg-white px-3.5 py-1.5 text-xs text-[#666]">
              {pill.emoji} {pill.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
