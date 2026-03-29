'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import {
  Hotel,
  MapPin,
  Star,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Phone,
  ExternalLink,
  Plane,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import {
  useVacationHotelDetail,
  type VacationSearchResult,
  type VacationPackageOption,
} from '@/hooks/use-vacation-library'

interface VacationDetailModalProps {
  result: VacationSearchResult | null
  isOpen: boolean
  onClose: () => void
  tripContext?: { tripId: string; dayId: string; itineraryId: string }
  onAddToTrip?: (result: VacationSearchResult, pkg: VacationPackageOption) => void
  onCreateTrip?: (result: VacationSearchResult, pkg: VacationPackageOption) => void
}

type SortField = 'totalPrice' | 'departureDate' | 'nights' | 'tourOperator'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) {
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
  }
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 ml-1" />
    : <ChevronDown className="h-3 w-3 ml-1" />
}

export function VacationDetailModal({
  result,
  isOpen,
  onClose,
  tripContext,
  onAddToTrip,
  onCreateTrip,
}: VacationDetailModalProps) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [selectedPkg, setSelectedPkg] = useState<VacationPackageOption | null>(null)
  const [sortField, setSortField] = useState<SortField>('totalPrice')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [priceMode, setPriceMode] = useState<'pp' | 'total'>('pp')

  const { data: hotelDetail, isLoading: isLoadingDetail } = useVacationHotelDetail(
    result?.hotelId ?? null
  )

  const enrichment = hotelDetail?.enrichment ?? null
  const photos = enrichment?.photos ?? []

  // Sort packages
  const sortedPackages = useMemo(() => {
    if (!result) return []
    const pkgs = [...result.packages]
    pkgs.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'totalPrice':
          cmp = a.totalPrice - b.totalPrice
          break
        case 'departureDate':
          cmp = a.departureDate.localeCompare(b.departureDate)
          break
        case 'nights':
          cmp = a.nights - b.nights
          break
        case 'tourOperator':
          cmp = a.tourOperator.localeCompare(b.tourOperator)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return pkgs
  }, [result, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handlePrevPhoto = () => {
    setPhotoIdx((prev) => (prev === 0 ? photos.length - 1 : prev - 1))
  }

  const handleNextPhoto = () => {
    setPhotoIdx((prev) => (prev === photos.length - 1 ? 0 : prev + 1))
  }

  const handleRowClick = (pkg: VacationPackageOption) => {
    setSelectedPkg((prev) =>
      prev === pkg ? null : pkg
    )
  }

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toLocaleString()}`
  }

  // Reset state when result changes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPhotoIdx(0)
      setSelectedPkg(null)
      setSortField('totalPrice')
      setSortDir('asc')
      setPriceMode('pp')
      onClose()
    }
  }

  if (!result) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogDescription className="sr-only">
            View details for {result.hotelName} in {result.destination}
          </DialogDescription>
          <div className="flex items-start gap-3">
            <Hotel className="h-5 w-5 mt-1 text-ash-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold text-ash-900">
                {result.hotelName}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-sm text-ash-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {result.destination}
                </span>
                {result.starRating > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                    <Star className="h-3 w-3 mr-0.5 fill-current" />
                    {result.starRating}
                  </Badge>
                )}
                {result.monarcRating && (
                  <Badge variant="outline" className="text-xs">
                    Monarc {result.monarcRating}
                    {result.monarcReviewCount > 0 && (
                      <span className="ml-1 text-ash-400">({result.monarcReviewCount})</span>
                    )}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 h-0 overflow-y-auto">
          <div className="space-y-6 px-6 pb-6">
            {/* 1. Photo Gallery */}
            {photos.length > 0 && (
              <div className="relative h-64 rounded-lg overflow-hidden bg-muted">
                <Image
                  src={photos[photoIdx] ?? ''}
                  alt={`${result.hotelName} photo ${photoIdx + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 896px) 100vw, 896px"
                />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={handlePrevPhoto}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleNextPhoto}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                  {photoIdx + 1} / {photos.length}
                </div>
              </div>
            )}

            {/* 2. Enrichment Info */}
            {isLoadingDetail && (
              <div className="flex items-center gap-2 text-sm text-ash-500 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hotel details...
              </div>
            )}

            {enrichment && (
              <div className="space-y-4">
                {/* Rating Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {enrichment.googleRating && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-ash-500 mb-1">Google Rating</p>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">{enrichment.googleRating}</span>
                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      </div>
                      {enrichment.googleReviewCount != null && (
                        <p className="text-xs text-ash-400 mt-0.5">
                          {enrichment.googleReviewCount.toLocaleString()} reviews
                        </p>
                      )}
                    </div>
                  )}

                  {enrichment.tripadvisorRating && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-ash-500 mb-1">TripAdvisor Rating</p>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">{enrichment.tripadvisorRating}</span>
                        <Star className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
                      </div>
                      {enrichment.tripadvisorReviewCount != null && (
                        <p className="text-xs text-ash-400 mt-0.5">
                          {enrichment.tripadvisorReviewCount.toLocaleString()} reviews
                        </p>
                      )}
                    </div>
                  )}

                  {enrichment.address && (
                    <div className="rounded-lg border p-3 col-span-2">
                      <p className="text-xs text-ash-500 mb-1">Address</p>
                      <p className="text-sm font-medium truncate">{enrichment.address}</p>
                    </div>
                  )}
                </div>

                {/* Links Row */}
                {(enrichment.website || enrichment.phone || enrichment.tripadvisorLink) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {enrichment.website && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={enrichment.website} target="_blank" rel="noopener noreferrer">
                          <Globe className="h-3.5 w-3.5 mr-1.5" />
                          Website
                        </a>
                      </Button>
                    )}
                    {enrichment.phone && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`tel:${enrichment.phone}`}>
                          <Phone className="h-3.5 w-3.5 mr-1.5" />
                          {enrichment.phone}
                        </a>
                      </Button>
                    )}
                    {enrichment.tripadvisorLink && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={enrichment.tripadvisorLink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          TripAdvisor
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. Package Options Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-ash-900">
                  {result.packages.length} Package Option{result.packages.length !== 1 ? 's' : ''}
                </h3>
                <div className="flex items-center gap-2 text-xs text-ash-500">
                  <span className={priceMode === 'pp' ? 'font-medium text-ash-700' : ''}>Per Person</span>
                  <Switch
                    checked={priceMode === 'total'}
                    onCheckedChange={(checked) => setPriceMode(checked ? 'total' : 'pp')}
                  />
                  <span className={priceMode === 'total' ? 'font-medium text-ash-700' : ''}>Grand Total</span>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Room</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center text-xs font-medium hover:text-ash-900"
                        onClick={() => handleSort('tourOperator')}
                      >
                        TO
                        <SortIcon field="tourOperator" activeField={sortField} dir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center text-xs font-medium hover:text-ash-900"
                        onClick={() => handleSort('nights')}
                      >
                        Nts
                        <SortIcon field="nights" activeField={sortField} dir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center text-xs font-medium hover:text-ash-900"
                        onClick={() => handleSort('departureDate')}
                      >
                        Date
                        <SortIcon field="departureDate" activeField={sortField} dir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead>Flight</TableHead>
                    <TableHead>Times</TableHead>
                    <TableHead className="text-right">
                      <button
                        className="flex items-center text-xs font-medium hover:text-ash-900 ml-auto"
                        onClick={() => handleSort('totalPrice')}
                      >
                        Price
                        <SortIcon field="totalPrice" activeField={sortField} dir={sortDir} />
                      </button>
                    </TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPackages.map((pkg, idx) => {
                    const isSelected = selectedPkg === pkg
                    return (
                      <TableRow
                        key={`${pkg.tourOperator}-${pkg.roomType}-${pkg.departureDate}-${pkg.flightNumber}-${idx}`}
                        className={`cursor-pointer ${
                          isSelected
                            ? 'bg-amber-50 dark:bg-amber-950/20'
                            : ''
                        }`}
                        onClick={() => handleRowClick(pkg)}
                      >
                        <TableCell className="text-xs">
                          <div className="font-medium">{pkg.roomType}</div>
                          <div className="text-ash-400">{pkg.mealPlan}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {pkg.tourOperator}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{pkg.nights}</TableCell>
                        <TableCell className="text-xs">{pkg.departureDate}</TableCell>
                        <TableCell className="text-xs">
                          <span className="flex items-center gap-1">
                            <Plane className="h-3 w-3 text-ash-400" />
                            {pkg.flightNumber}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-ash-500">
                          {pkg.departureTime} - {pkg.arrivalTime}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-semibold text-emerald-600">
                            {formatPrice(priceMode === 'pp' ? pkg.totalPrice : pkg.grandTotal)}
                          </div>
                          <div className="text-[10px] text-ash-400">
                            {priceMode === 'pp' ? '/pp' : 'total'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={isSelected ? 'default' : 'outline'}
                            className="text-xs h-7"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRowClick(pkg)
                            }}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 border-t border-ash-200 p-6 pt-4">
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <div className="flex gap-3">
              {!tripContext && onCreateTrip && (
                <Button
                  variant="outline"
                  disabled={!selectedPkg}
                  onClick={() => {
                    if (selectedPkg && result) {
                      onCreateTrip(result, selectedPkg)
                    }
                  }}
                >
                  Create Trip
                </Button>
              )}
              <Button
                disabled={!selectedPkg}
                className="bg-phoenix-gold-600 hover:bg-phoenix-gold-700"
                onClick={() => {
                  if (selectedPkg && result && onAddToTrip) {
                    onAddToTrip(result, selectedPkg)
                  }
                }}
              >
                {tripContext ? 'Add to Itinerary' : 'Add to Trip'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
