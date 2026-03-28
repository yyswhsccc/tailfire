interface HubHeroMetaProps {
  items: Array<{ label: string }>
}

export function HubHeroMeta({ items }: HubHeroMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
      {items.map((item, i) => (
        <span key={i} className="text-sm text-white/80">
          {i > 0 && <span className="mr-3 text-white/30">·</span>}
          {item.label}
        </span>
      ))}
    </div>
  )
}
