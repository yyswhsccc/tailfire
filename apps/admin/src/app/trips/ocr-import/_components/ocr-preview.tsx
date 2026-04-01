'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2, Plane, Hotel, Ship, Car, UtensilsCrossed, BookOpen, Package, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OcrTravelerMatches } from './ocr-traveler-matches'
import { PolicyDiffDialog } from './policy-diff-dialog'
import { useOcrConfirm, useUpdateSupplierPolicies } from '@/hooks/use-ocr-import'
import { ApiError } from '@/lib/api'
import type {
  OcrPreviewResponse,
  OcrConfirmRequest,
  OcrDocumentType,
  OcrExtractionData,
  OcrPackagePayment,
  PolicyDiff,
} from '@tailfire/shared-types'

const DOC_TYPE_LABELS: Record<OcrDocumentType, string> = {
  flight_confirmation: 'Flight Confirmation',
  hotel_confirmation: 'Hotel Confirmation',
  cruise_confirmation: 'Cruise Confirmation',
  passport: 'Passport',
  transportation_confirmation: 'Transportation',
  dining_confirmation: 'Dining Reservation',
  package_confirmation: 'All-Inclusive Package',
  general_travel_document: 'Travel Document',
}

const DOC_TYPE_ICONS: Record<OcrDocumentType, typeof Plane> = {
  flight_confirmation: Plane,
  hotel_confirmation: Hotel,
  cruise_confirmation: Ship,
  passport: BookOpen,
  transportation_confirmation: Car,
  dining_confirmation: UtensilsCrossed,
  package_confirmation: Package,
  general_travel_document: BookOpen,
}

function formatPrice(cents: number | null | undefined, currency: string | null | undefined) {
  if (!cents) return null
  const amount = cents / 100
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
  }).format(amount)
}

interface PaymentInfo {
  totalPriceCents: number
  currency: string
  bookingDate: string | null
  payments?: OcrPackagePayment[]
}

function getPaymentInfo(extraction: OcrExtractionData): PaymentInfo | null {
  if (extraction.package && extraction.package.totalPriceCents != null && extraction.package.totalPriceCents > 0) {
    return {
      totalPriceCents: extraction.package.totalPriceCents,
      currency: extraction.package.currency || 'CAD',
      bookingDate: extraction.package.bookingDate ?? null,
      payments: extraction.package.payments,
    }
  }

  const sources = [
    extraction.flight && {
      totalPriceCents: extraction.flight.totalPriceCents,
      currency: extraction.flight.currency,
      bookingDate: extraction.booking?.bookingDate ?? null,
    },
    extraction.lodging && {
      totalPriceCents: extraction.lodging.totalPriceCents,
      currency: extraction.lodging.currency,
      bookingDate: extraction.booking?.bookingDate ?? null,
    },
    extraction.cruise && {
      totalPriceCents: extraction.cruise.totalPriceCents,
      currency: extraction.cruise.currency,
      bookingDate: extraction.booking?.bookingDate ?? null,
    },
    extraction.transportation && {
      totalPriceCents: extraction.transportation.totalPriceCents,
      currency: extraction.transportation.currency,
      bookingDate: extraction.booking?.bookingDate ?? null,
    },
    extraction.dining && {
      totalPriceCents: extraction.dining.totalPriceCents,
      currency: extraction.dining.currency,
      bookingDate: extraction.booking?.bookingDate ?? null,
    },
  ] as const

  for (const src of sources) {
    if (src && src.totalPriceCents != null && src.totalPriceCents > 0) {
      return {
        totalPriceCents: src.totalPriceCents,
        currency: src.currency || 'CAD',
        bookingDate: src.bookingDate ?? null,
      }
    }
  }
  return null
}

function PaymentPreview({ extraction }: { extraction: OcrExtractionData }) {
  const info = getPaymentInfo(extraction)
  if (!info) return null

  const payments = info.payments && info.payments.length > 0 ? info.payments : null

  if (payments) {
    const paymentTotal = payments.reduce((sum, p) => sum + p.amountCents, 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ash-50 text-left">
                  <th className="px-3 py-1.5 text-xs font-medium text-ash-500">Payment</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-ash-500 text-right">Amount</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-ash-500">Date</th>
                  <th className="px-3 py-1.5 text-xs font-medium text-ash-500">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{p.paymentName}</td>
                    <td className="px-3 py-1.5 text-right">{formatPrice(p.amountCents, info.currency)}</td>
                    <td className="px-3 py-1.5 text-ash-500">{p.date || '—'}</td>
                    <td className="px-3 py-1.5 text-ash-500">{p.method || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-ash-50">
                  <td className="px-3 py-1.5 font-medium">Total</td>
                  <td className="px-3 py-1.5 text-right font-medium">{formatPrice(paymentTotal, info.currency)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-3">
            <span className="text-sm text-ash-500 w-28 shrink-0">Status</span>
            <Badge variant="default" className="text-xs">Paid</Badge>
          </div>
          <p className="text-xs text-ash-400 mt-1">
            A payment schedule will be created with {payments.length} payment{payments.length > 1 ? 's' : ''} recorded.
            {paymentTotal < info.totalPriceCents && ' A remaining balance item will be added for the difference.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const formattedAmount = formatPrice(info.totalPriceCents, info.currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <DataRow label="Schedule" value="Full Payment" />
        <DataRow label="Amount" value={formattedAmount} />
        <DataRow label="Transaction Date" value={info.bookingDate || 'Date of import'} />
        <div className="flex gap-3">
          <span className="text-sm text-ash-500 w-28 shrink-0">Status</span>
          <Badge variant="default" className="text-xs">Paid</Badge>
        </div>
        <p className="text-xs text-ash-400 mt-1">
          A payment schedule will be created automatically with the full amount recorded as received.
        </p>
      </CardContent>
    </Card>
  )
}

interface OcrPreviewProps {
  preview: OcrPreviewResponse
  existingTripId?: string
  existingTripName?: string
  existingContactId?: string
  onBack: () => void
  onConfirmSuccess: (tripId: string | null, contactId: string | null) => void
}

export function OcrPreview({
  preview,
  existingTripId,
  existingTripName,
  existingContactId,
  onBack,
  onConfirmSuccess,
}: OcrPreviewProps) {
  const [tripName, setTripName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [policyDiff, setPolicyDiff] = useState<PolicyDiff | null>(null)
  const [pendingNav, setPendingNav] = useState<{ tripId: string | null; contactId: string | null } | null>(null)
  const confirmMutation = useOcrConfirm()
  const updatePoliciesMutation = useUpdateSupplierPolicies()

  const { documentType, confidence, extraction, contactMatches } = preview
  const Icon = DOC_TYPE_ICONS[documentType] || BookOpen

  async function handleConfirm() {
    setError(null)

    const request: OcrConfirmRequest = {
      jobId: preview.jobId,
      documentType,
      tripId: existingTripId || null,
      contactId: existingContactId || null,
      tripName: !existingTripId && tripName ? tripName : null,
    }

    try {
      const result = await confirmMutation.mutateAsync(request)

      // If there's a policy diff, show dialog instead of navigating
      if (result.policyDiff) {
        setPolicyDiff(result.policyDiff)
        setPendingNav({ tripId: result.tripId ?? null, contactId: result.contactId ?? null })
        return
      }

      onConfirmSuccess(result.tripId ?? null, result.contactId ?? null)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Failed to confirm import.')
      } else {
        setError('An unexpected error occurred.')
      }
    }
  }

  async function handleUpdateDefaults() {
    if (!policyDiff || !pendingNav) return
    try {
      const data: Record<string, string> = {}
      if (policyDiff.termsAndConditions) {
        data.defaultTermsAndConditions = policyDiff.termsAndConditions.extracted
      }
      if (policyDiff.cancellationPolicy) {
        data.defaultCancellationPolicy = policyDiff.cancellationPolicy.extracted
      }
      await updatePoliciesMutation.mutateAsync({
        supplierId: policyDiff.supplierId,
        data,
      })
    } catch {
      // Non-blocking — navigate anyway
    }
    setPolicyDiff(null)
    onConfirmSuccess(pendingNav.tripId, pendingNav.contactId)
  }

  function handleKeepDefaults() {
    if (!pendingNav) return
    setPolicyDiff(null)
    onConfirmSuccess(pendingNav.tripId, pendingNav.contactId)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{DOC_TYPE_LABELS[documentType]}</h2>
          <Badge variant={confidence > 0.8 ? 'default' : 'secondary'} className="text-xs">
            {Math.round(confidence * 100)}% confidence
          </Badge>
        </div>
      </div>

      {/* Extracted Data by Type */}
      {extraction.flight && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flight Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.flight.confirmationNumber && (
              <DataRow label="Confirmation" value={extraction.flight.confirmationNumber} />
            )}
            {extraction.flight.airline && (
              <DataRow label="Airline" value={extraction.flight.airline} />
            )}
            {extraction.flight.segments?.map((seg, i) => (
              <div key={i} className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-medium text-ash-500">Segment {seg.segmentOrder}</p>
                <p className="text-sm">
                  {seg.flightNumber && <span className="font-medium">{seg.flightNumber} </span>}
                  {seg.departureAirportCode} &rarr; {seg.arrivalAirportCode}
                </p>
                <p className="text-xs text-ash-500">
                  {seg.departureDate} {seg.departureTime && `at ${seg.departureTime}`}
                  {seg.arrivalDate && ` — ${seg.arrivalDate}`}
                  {seg.arrivalTime && ` at ${seg.arrivalTime}`}
                </p>
              </div>
            ))}
            {extraction.flight.totalPriceCents && (
              <DataRow label="Total" value={formatPrice(extraction.flight.totalPriceCents, extraction.flight.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.lodging && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hotel Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.lodging.propertyName && (
              <DataRow label="Property" value={extraction.lodging.propertyName} />
            )}
            {extraction.lodging.confirmationNumber && (
              <DataRow label="Confirmation" value={extraction.lodging.confirmationNumber} />
            )}
            {extraction.lodging.checkInDate && (
              <DataRow label="Check-in" value={`${extraction.lodging.checkInDate}${extraction.lodging.checkInTime ? ` at ${extraction.lodging.checkInTime}` : ''}`} />
            )}
            {extraction.lodging.checkOutDate && (
              <DataRow label="Check-out" value={`${extraction.lodging.checkOutDate}${extraction.lodging.checkOutTime ? ` at ${extraction.lodging.checkOutTime}` : ''}`} />
            )}
            {extraction.lodging.roomType && (
              <DataRow label="Room" value={extraction.lodging.roomType} />
            )}
            {extraction.lodging.address && (
              <DataRow label="Address" value={extraction.lodging.address} />
            )}
            {extraction.lodging.totalPriceCents && (
              <DataRow label="Total" value={formatPrice(extraction.lodging.totalPriceCents, extraction.lodging.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.cruise && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cruise Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.cruise.catalogMatch && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                extraction.cruise.catalogMatch.matched
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {extraction.cruise.catalogMatch.matched ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Matched to catalog
                      {extraction.cruise.catalogMatch.providerIdentifier && (
                        <span className="font-medium"> — {extraction.cruise.catalogMatch.providerIdentifier}</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>No catalog match found — cruise will be created from OCR data only</span>
                  </>
                )}
              </div>
            )}
            {extraction.cruise.cruiseLineName && (
              <DataRow label="Cruise Line" value={extraction.cruise.cruiseLineName} />
            )}
            {extraction.cruise.shipName && (
              <DataRow label="Ship" value={extraction.cruise.shipName} />
            )}
            {extraction.cruise.confirmationNumber && (
              <DataRow label="Booking" value={extraction.cruise.confirmationNumber} />
            )}
            {extraction.cruise.departurePort && (
              <DataRow label="Departure" value={`${extraction.cruise.departurePort}${extraction.cruise.departureDate ? ` on ${extraction.cruise.departureDate}` : ''}`} />
            )}
            {extraction.cruise.arrivalPort && (
              <DataRow label="Arrival" value={`${extraction.cruise.arrivalPort}${extraction.cruise.arrivalDate ? ` on ${extraction.cruise.arrivalDate}` : ''}`} />
            )}
            {extraction.cruise.cabinCategory && (
              <DataRow label="Cabin" value={`${extraction.cruise.cabinCategory}${extraction.cruise.cabinNumber ? ` #${extraction.cruise.cabinNumber}` : ''}`} />
            )}
            {extraction.cruise.nights && (
              <DataRow label="Duration" value={`${extraction.cruise.nights} nights`} />
            )}
            {extraction.cruise.totalPriceCents && (
              <DataRow label="Gross" value={formatPrice(extraction.cruise.totalPriceCents, extraction.cruise.currency)} />
            )}
            {extraction.cruise.netPriceCents && (
              <DataRow label="Net" value={formatPrice(extraction.cruise.netPriceCents, extraction.cruise.currency)} />
            )}
            {extraction.cruise.commissionCents && (
              <DataRow label="Commission" value={formatPrice(extraction.cruise.commissionCents, extraction.cruise.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.passport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Passport Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.passport.firstName && (
              <DataRow label="Name" value={`${extraction.passport.firstName}${extraction.passport.middleName ? ` ${extraction.passport.middleName}` : ''} ${extraction.passport.lastName || ''}`} />
            )}
            {extraction.passport.passportNumber && (
              <DataRow label="Passport #" value={extraction.passport.passportNumber} />
            )}
            {extraction.passport.dateOfBirth && (
              <DataRow label="Date of Birth" value={extraction.passport.dateOfBirth} />
            )}
            {extraction.passport.nationality && (
              <DataRow label="Nationality" value={extraction.passport.nationality} />
            )}
            {extraction.passport.expiryDate && (
              <DataRow label="Expiry" value={extraction.passport.expiryDate} />
            )}
            {extraction.passport.issuingCountry && (
              <DataRow label="Issuing Country" value={extraction.passport.issuingCountry} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.transportation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transportation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.transportation.companyName && (
              <DataRow label="Company" value={extraction.transportation.companyName} />
            )}
            {extraction.transportation.transportationType && (
              <DataRow label="Type" value={extraction.transportation.transportationType} />
            )}
            {extraction.transportation.confirmationNumber && (
              <DataRow label="Confirmation" value={extraction.transportation.confirmationNumber} />
            )}
            {extraction.transportation.pickupLocation && (
              <DataRow label="Pickup" value={`${extraction.transportation.pickupLocation}${extraction.transportation.pickupDate ? ` on ${extraction.transportation.pickupDate}` : ''}`} />
            )}
            {extraction.transportation.dropoffLocation && (
              <DataRow label="Drop-off" value={`${extraction.transportation.dropoffLocation}${extraction.transportation.dropoffDate ? ` on ${extraction.transportation.dropoffDate}` : ''}`} />
            )}
            {extraction.transportation.vehicleType && (
              <DataRow label="Vehicle" value={extraction.transportation.vehicleType} />
            )}
            {extraction.transportation.totalPriceCents && (
              <DataRow label="Total" value={formatPrice(extraction.transportation.totalPriceCents, extraction.transportation.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.dining && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dining Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {extraction.dining.restaurantName && (
              <DataRow label="Restaurant" value={extraction.dining.restaurantName} />
            )}
            {extraction.dining.confirmationNumber && (
              <DataRow label="Confirmation" value={extraction.dining.confirmationNumber} />
            )}
            {extraction.dining.reservationDate && (
              <DataRow label="Date" value={`${extraction.dining.reservationDate}${extraction.dining.reservationTime ? ` at ${extraction.dining.reservationTime}` : ''}`} />
            )}
            {extraction.dining.partySize && (
              <DataRow label="Party Size" value={String(extraction.dining.partySize)} />
            )}
            {extraction.dining.address && (
              <DataRow label="Address" value={extraction.dining.address} />
            )}
            {extraction.dining.totalPriceCents && (
              <DataRow label="Total" value={formatPrice(extraction.dining.totalPriceCents, extraction.dining.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {extraction.package && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {extraction.package.supplierName && (
              <DataRow label="Supplier" value={extraction.package.supplierName} />
            )}
            {extraction.package.bookingReference && (
              <DataRow label="Booking Ref" value={extraction.package.bookingReference} />
            )}
            {extraction.package.totalPriceCents && (
              <DataRow label="Total" value={formatPrice(extraction.package.totalPriceCents, extraction.package.currency)} />
            )}
            {extraction.package.commissionRate && (
              <DataRow label="Commission" value={`${extraction.package.commissionRate}%${extraction.package.commissionAmountCents ? ` (${formatPrice(extraction.package.commissionAmountCents, extraction.package.currency)})` : ''}`} />
            )}
            {extraction.package.taxesAndFeesCents && (
              <DataRow label="Taxes & Fees" value={formatPrice(extraction.package.taxesAndFeesCents, extraction.package.currency)} />
            )}
            {extraction.package.addOnsCents != null && extraction.package.addOnsCents > 0 && (
              <DataRow label="Add-ons" value={formatPrice(extraction.package.addOnsCents, extraction.package.currency)} />
            )}
            {extraction.package.bookingDate && (
              <DataRow label="Booking Date" value={extraction.package.bookingDate} />
            )}
            {extraction.package.remarks && (
              <p className="text-xs text-ash-500">{extraction.package.remarks}</p>
            )}

            {/* Components */}
            {extraction.package.components?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Components</p>
                {extraction.package.components.map((comp, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{comp.componentType}</Badge>
                      {comp.name && <span className="text-sm font-medium">{comp.name}</span>}
                    </div>
                    {comp.description && <p className="text-xs text-ash-500">{comp.description}</p>}
                    {comp.flight && (
                      <p className="text-xs text-ash-500">
                        {comp.flight.flightNumber && `${comp.flight.flightNumber} `}
                        {comp.flight.departureAirportCode} &rarr; {comp.flight.arrivalAirportCode}
                        {comp.flight.departureDate && ` on ${comp.flight.departureDate}`}
                        {comp.flight.departureTime && ` at ${comp.flight.departureTime}`}
                      </p>
                    )}
                    {comp.lodging && (
                      <p className="text-xs text-ash-500">
                        {comp.lodging.propertyName}
                        {comp.lodging.checkInDate && ` — ${comp.lodging.checkInDate}`}
                        {comp.lodging.checkOutDate && ` to ${comp.lodging.checkOutDate}`}
                        {comp.lodging.roomType && ` (${comp.lodging.roomType})`}
                      </p>
                    )}
                    {comp.transportation && (
                      <p className="text-xs text-ash-500">
                        {comp.transportation.pickupLocation}
                        {comp.transportation.dropoffLocation && ` → ${comp.transportation.dropoffLocation}`}
                        {comp.transportation.pickupDate && ` on ${comp.transportation.pickupDate}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Per-Person Pricing */}
            {extraction.package.perPersonPricing?.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Per-Person Pricing</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-ash-50 text-left">
                        <th className="px-3 py-1.5 text-xs font-medium text-ash-500">Traveler</th>
                        <th className="px-3 py-1.5 text-xs font-medium text-ash-500 text-right">Base</th>
                        <th className="px-3 py-1.5 text-xs font-medium text-ash-500 text-right">Taxes</th>
                        <th className="px-3 py-1.5 text-xs font-medium text-ash-500 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraction.package.perPersonPricing.map((pp, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5">{pp.label}</td>
                          <td className="px-3 py-1.5 text-right">{formatPrice(pp.basePriceCents, extraction.package?.currency)}</td>
                          <td className="px-3 py-1.5 text-right">{formatPrice(pp.taxesCents, extraction.package?.currency)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatPrice(pp.totalPriceCents, extraction.package?.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Payment Preview — shown for any type with a price */}
      <PaymentPreview extraction={extraction} />

      {/* Traveler Matches */}
      {contactMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Traveler Matching</CardTitle>
          </CardHeader>
          <CardContent>
            <OcrTravelerMatches matches={contactMatches} />
          </CardContent>
        </Card>
      )}

      {/* Trip Name (if creating new trip) */}
      {!existingTripId && documentType !== 'passport' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trip Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Trip Name (optional)</Label>
              <Input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
              <p className="text-xs text-ash-500">
                A new trip will be created. Leave blank for an auto-generated name.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {existingTripId && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
          <p className="text-sm text-blue-800">
            Activity will be added to: <strong>{existingTripName || existingTripId}</strong>
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Extracted Policies Preview */}
      <ExtractedPoliciesSection extraction={extraction} />

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={confirmMutation.isPending}>
          {confirmMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Confirm Import'
          )}
        </Button>
      </div>

      {/* Policy Diff Dialog */}
      {policyDiff && (
        <PolicyDiffDialog
          policyDiff={policyDiff}
          open={!!policyDiff}
          isPending={updatePoliciesMutation.isPending}
          onUpdateDefaults={handleUpdateDefaults}
          onKeepDefaults={handleKeepDefaults}
        />
      )}
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <span className="text-sm text-ash-500 w-28 shrink-0">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

function ExtractedPoliciesSection({ extraction }: { extraction: OcrExtractionData }) {
  // Collect T&C and cancellation from whichever type has them
  const tc =
    extraction.flight?.termsAndConditions ||
    extraction.lodging?.termsAndConditions ||
    extraction.cruise?.termsAndConditions ||
    extraction.transportation?.termsAndConditions ||
    extraction.dining?.termsAndConditions ||
    extraction.package?.termsAndConditions ||
    null

  const cp =
    extraction.flight?.cancellationPolicy ||
    extraction.lodging?.cancellationPolicy ||
    extraction.cruise?.cancellationPolicy ||
    extraction.transportation?.cancellationPolicy ||
    extraction.dining?.cancellationPolicy ||
    extraction.package?.cancellationPolicy ||
    null

  if (!tc && !cp) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Extracted Policies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tc && (
          <PolicyBlock label="Terms & Conditions" text={tc} />
        )}
        {cp && (
          <PolicyBlock label="Cancellation Policy" text={cp} />
        )}
      </CardContent>
    </Card>
  )
}

function PolicyBlock({ label, text }: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 200

  return (
    <div>
      <p className="text-sm font-medium text-ash-600 mb-1">{label}</p>
      <div className="rounded-md border bg-ash-50/50 p-3">
        <p className="text-xs whitespace-pre-wrap">
          {isLong && !expanded ? `${text.slice(0, 200)}...` : text}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary mt-1 hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  )
}
