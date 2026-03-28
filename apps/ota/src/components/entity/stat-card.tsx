interface StatCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-white/70">{label}</span>
    </div>
  )
}
