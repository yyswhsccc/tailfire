import { type LucideIcon, Clock } from 'lucide-react'

interface ComingSoonSectionProps {
  title: string
  description: string
  icon?: LucideIcon
}

export function ComingSoonSection({
  title,
  description,
  icon: Icon = Clock
}: ComingSoonSectionProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-ash-100 p-4 mb-4">
        <Icon className="h-8 w-8 text-ash-400" />
      </div>
      <h3 className="text-lg font-semibold text-ash-900 mb-2">{title}</h3>
      <p className="text-sm text-ash-600 text-center max-w-md">
        {description}
      </p>
    </div>
  )
}
