'use client'

import { useRouter } from 'next/navigation'
import {
  TrendingUp,
  DollarSign,
  MapPin,
  Shield,
  Users,
  HeartPulse,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ReportDefinition, ReportCategory } from '@tailfire/shared-types/api'

// -- Category metadata --

interface CategoryMeta {
  label: string
  icon: LucideIcon
  colorClass: string
}

const CATEGORY_META: Record<ReportCategory, CategoryMeta> = {
  sales: { label: 'Sales', icon: TrendingUp, colorClass: 'text-blue-600' },
  financial: { label: 'Financial', icon: DollarSign, colorClass: 'text-green-600' },
  operational: { label: 'Operational', icon: MapPin, colorClass: 'text-orange-600' },
  compliance: { label: 'Compliance', icon: Shield, colorClass: 'text-red-600' },
  crm: { label: 'CRM', icon: Users, colorClass: 'text-purple-600' },
  insurance: { label: 'Insurance', icon: HeartPulse, colorClass: 'text-teal-600' },
}

const CATEGORY_ORDER: ReportCategory[] = [
  'sales',
  'financial',
  'operational',
  'compliance',
  'crm',
  'insurance',
]

// -- Component --

interface ReportCatalogProps {
  reports: ReportDefinition[]
}

export function ReportCatalog({ reports }: ReportCatalogProps) {
  const router = useRouter()

  const grouped = CATEGORY_ORDER.reduce<Record<ReportCategory, ReportDefinition[]>>(
    (acc, category) => {
      acc[category] = reports.filter((r) => r.category === category)
      return acc
    },
    {} as Record<ReportCategory, ReportDefinition[]>,
  )

  return (
    <div className="space-y-10">
      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category]
        if (items.length === 0) return null

        const { label, icon: Icon, colorClass } = CATEGORY_META[category]

        return (
          <section key={category}>
            <div className="flex items-center gap-2 mb-4">
              <Icon className={`h-5 w-5 ${colorClass}`} />
              <h2 className="text-lg font-semibold text-ash-900">{label}</h2>
              <Badge variant="secondary" className="text-xs">
                {items.length}
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((report) => (
                <Card
                  key={report.slug}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/reporting/${report.slug}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-snug">
                        {report.name}
                      </CardTitle>
                      {report.scope === 'admin-only' && (
                        <Badge variant="outline" className="shrink-0 text-xs">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs leading-relaxed">
                      {report.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
