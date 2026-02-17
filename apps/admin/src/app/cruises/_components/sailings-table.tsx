'use client'

import Link from 'next/link'
import { Ship, Calendar, Moon, MapPin } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  type SailingSearchItem,
  formatSailDate,
  formatPrice,
  getCheapestPrice,
} from '@/hooks/use-cruise-sailings'

interface SailingsTableProps {
  sailings: SailingSearchItem[]
}

export function SailingsTable({ sailings }: SailingsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[300px]">Sailing</TableHead>
          <TableHead>Ship</TableHead>
          <TableHead>Route</TableHead>
          <TableHead className="text-center">Nights</TableHead>
          <TableHead className="text-right">From Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sailings.map((sailing) => {
          const cheapestPrice = getCheapestPrice(sailing.prices)
          
          return (
            <TableRow key={sailing.id}>
              <TableCell>
                <Link
                  href={'/cruises/' + sailing.id}
                  className="block group"
                >
                  <div className="font-medium text-ash-900 group-hover:text-phoenix-gold-600 transition-colors">
                    {sailing.name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-ash-500 mt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatSailDate(sailing.sailDate)}
                  </div>
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  {sailing.ship.imageUrl ? (
                    <img
                      src={sailing.ship.imageUrl}
                      alt={sailing.ship.name}
                      className="w-10 h-10 rounded object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-ash-100 flex items-center justify-center">
                      <Ship className="h-5 w-5 text-ash-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-sm">{sailing.ship.name}</div>
                    <div className="text-xs text-ash-500">
                      {sailing.cruiseLine.name}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-ash-400" />
                  <span>{sailing.embarkPort.name}</span>
                  {sailing.embarkPort.name !== sailing.disembarkPort.name && (
                    <>
                      <span className="text-ash-400 mx-1">→</span>
                      <span>{sailing.disembarkPort.name}</span>
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary" className="font-mono">
                  <Moon className="h-3 w-3 mr-1" />
                  {sailing.nights}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {cheapestPrice !== null ? (
                  <div>
                    <div className="font-semibold text-phoenix-gold-600">
                      {formatPrice(cheapestPrice)}
                    </div>
                    <div className="text-xs text-ash-500">per person</div>
                  </div>
                ) : (
                  <span className="text-ash-400 text-sm">Price TBA</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
