import {
  Plane, Hotel, Car, Utensils, Ship, Map, Anchor, Settings, Package, MoreHorizontal,
} from 'lucide-react'
import type {
  SharedActivityDto,
  SharedPortInfoDetailDto,
  SharedOptionsDetailDto,
} from '@tailfire/shared-types'
import { FlightDetail } from './FlightDetail'
import { LodgingDetail } from './LodgingDetail'
import { TransportDetail } from './TransportDetail'
import { DiningDetail } from './DiningDetail'
import { CruiseDetail } from './CruiseDetail'
import { TourDetail } from './TourDetail'
import { PackageDetail } from './PackageDetail'
import { GenericDetail } from './GenericDetail'

export const typeIcons: Record<string, typeof Plane> = {
  flight: Plane,
  lodging: Hotel,
  transportation: Car,
  dining: Utensils,
  custom_cruise: Ship,
  cruise: Ship,
  custom_tour: Map,
  tour: Map,
  package: Package,
  port_info: Anchor,
  options: Settings,
  tour_day: Map,
}

export const statusVariants: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
  draft: { label: 'Draft', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  proposing: { label: 'Proposing', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-400 border-red-500/20 line-through' },
}

export function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function renderActivityDetail(activity: SharedActivityDto, currency: string) {
  const detail = activity.detail
  if (!detail) return null

  switch (detail.type) {
    case 'flight':
      return <FlightDetail detail={detail} />
    case 'lodging':
      return <LodgingDetail detail={detail} />
    case 'transportation':
      return <TransportDetail detail={detail} />
    case 'dining':
      return <DiningDetail detail={detail} />
    case 'custom_cruise':
      return <CruiseDetail detail={detail} />
    case 'custom_tour':
      return <TourDetail detail={detail} />
    case 'package':
      return <PackageDetail detail={detail} currency={currency} />
    case 'port_info':
      return <PortInfoDetail detail={detail} />
    case 'options':
      return <OptionsDetail detail={detail} />
    case 'generic':
    default:
      return <GenericDetail />
  }
}

export function PortInfoDetail({ detail }: { detail: SharedPortInfoDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Anchor className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.portName && <div className="font-medium">{detail.portName}</div>}
        {detail.portLocation && <div className="text-muted-foreground">{detail.portLocation}</div>}
        {detail.portType && <div className="text-muted-foreground capitalize">{detail.portType.replace('_', ' ')}</div>}
        {(detail.arrivalDate || detail.departureDate) && (
          <div className="text-muted-foreground">
            {detail.arrivalTime && <span>Arrive: {detail.arrivalTime.slice(0, 5)}</span>}
            {detail.departureTime && <span> · Depart: {detail.departureTime.slice(0, 5)}</span>}
          </div>
        )}
        {detail.tenderRequired && (
          <div className="text-xs text-amber-400">Tender required</div>
        )}
      </div>
    </div>
  )
}

export function OptionsDetail({ detail }: { detail: SharedOptionsDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Settings className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.optionCategory && (
          <div className="text-muted-foreground capitalize">{detail.optionCategory.replace('_', ' ')}</div>
        )}
        {detail.providerName && <div className="text-muted-foreground">{detail.providerName}</div>}
        {detail.durationMinutes && (
          <div className="text-muted-foreground">{detail.durationMinutes} minutes</div>
        )}
        {detail.inclusions.length > 0 && (
          <div className="text-xs text-muted-foreground">{detail.inclusions.join(' · ')}</div>
        )}
      </div>
    </div>
  )
}
