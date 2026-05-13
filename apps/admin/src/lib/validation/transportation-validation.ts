/**
 * Transportation Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles nested object validation for transportation details.
 */

import { z } from 'zod'
import type {
  CreateTransportationActivityDto,
  TransportationSubtype,
  PricingType,
} from '@tailfire/shared-types/api'

// ============================================================================
// Transportation Details Schema (nested object)
// ============================================================================

export const transportationDetailsSchema = z.object({
  // Transportation type classification
  subtype: z
    .enum(['transfer', 'car_rental', 'private_car', 'taxi', 'shuttle', 'train', 'ferry', 'bus', 'limousine'])
    .nullable()
    .optional(),

  // Provider information
  providerName: z.string().optional().default(''),
  providerPhone: z.string().optional().default(''),
  providerEmail: z.string().email('Invalid email format').or(z.literal('')).optional().default(''),

  // Vehicle details
  vehicleType: z.string().optional().default(''),
  vehicleModel: z.string().optional().default(''),
  vehicleCapacity: z.coerce.number().int().min(1).max(100).nullable().optional(),
  licensePlate: z.string().optional().default(''),

  // Pickup details
  pickupDate: z.string().nullable().optional(),
  pickupTime: z.string().optional().default(''),
  pickupTimezone: z.string().optional().default(''),
  pickupAddress: z.string().optional().default(''),
  pickupNotes: z.string().optional().default(''),

  // Dropoff details
  dropoffDate: z.string().nullable().optional(),
  dropoffTime: z.string().optional().default(''),
  dropoffTimezone: z.string().optional().default(''),
  dropoffAddress: z.string().optional().default(''),
  dropoffNotes: z.string().optional().default(''),

  // Driver information
  driverName: z.string().optional().default(''),
  driverPhone: z.string().optional().default(''),

  // Car rental specific fields
  rentalPickupLocation: z.string().optional().default(''),
  rentalDropoffLocation: z.string().optional().default(''),
  rentalInsuranceType: z.string().optional().default(''),
  rentalMileageLimit: z.string().optional().default(''),

  // Structured pickup location (Google Places + Amadeus)
  pickupName: z.string().nullable().optional().default(null),
  pickupLat: z.coerce.number().nullable().optional().default(null),
  pickupLng: z.coerce.number().nullable().optional().default(null),
  pickupPlaceId: z.string().nullable().optional().default(null),
  dropoffName: z.string().nullable().optional().default(null),
  dropoffLat: z.coerce.number().nullable().optional().default(null),
  dropoffLng: z.coerce.number().nullable().optional().default(null),
  dropoffPlaceId: z.string().nullable().optional().default(null),

  // Enhanced car rental (Amadeus-aligned)
  rentalCompany: z.string().optional().default(''),
  rentalBookingRef: z.string().optional().default(''),
  rentalCarClass: z.string().optional().default(''),
  rentalFuelPolicy: z.string().optional().default(''),

  // Station/terminal for train, ferry, bus (top-level summary — used when
  // legs is empty for a single-leg journey)
  departureStation: z.string().optional().default(''),
  arrivalStation: z.string().optional().default(''),

  // Multi-leg journey (train/bus with interchanges).
  // interchangeMinutesAfter is the buffer to the next leg; ignored on the last.
  // Optional + undefined-rather-than-default so existing test fixtures + non-rail
  // subtypes don't have to construct an empty array explicitly.
  legs: z
    .array(
      z.object({
        trainNumber: z.string().optional().default(''),
        operator: z.string().optional().default(''),
        departureStation: z.string().optional().default(''),
        arrivalStation: z.string().optional().default(''),
        departureDate: z.string().nullable().optional(),
        departureTime: z.string().optional().default(''),
        arrivalDate: z.string().nullable().optional(),
        arrivalTime: z.string().optional().default(''),
        interchangeMinutesAfter: z.coerce.number().int().min(0).max(1440).nullable().optional(),
      }),
    )
    .optional(),

  // Additional details
  features: z.array(z.string()).optional().default([]),
  specialRequests: z.string().optional().default(''),
  flightNumber: z.string().optional().default(''),
  isRoundTrip: z.boolean().default(false),
})

// ============================================================================
// Main Transportation Form Schema
// ============================================================================

export const transportationFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('transportation').default('transportation'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),
  notes: z.string().optional().default(''),
  confirmationNumber: z.string().optional().default(''),

  // Nested transportation details
  transportationDetails: transportationDetailsSchema,

  // Pricing fields
  totalPriceCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .nullable()
    .optional(),
  taxesAndFeesCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .nullable()
    .optional(),
  currency: z.string().default('CAD'),
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night']).default('flat_rate'),

  // Commission fields (optional)
  commissionTotalCents: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative())
    .nullable()
    .optional(),
  commissionSplitPercentage: z.coerce
    .number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().min(0).max(100))
    .nullable()
    .optional(),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  supplier: z.string().optional().default(''),
})

export type TransportationFormData = z.infer<typeof transportationFormSchema>
export type TransportationDetailsData = z.infer<typeof transportationDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const TRANSPORTATION_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'notes',
  'confirmationNumber',
  'transportationDetails',
  'transportationDetails.subtype',
  'transportationDetails.providerName',
  'transportationDetails.providerPhone',
  'transportationDetails.providerEmail',
  'transportationDetails.vehicleType',
  'transportationDetails.vehicleModel',
  'transportationDetails.vehicleCapacity',
  'transportationDetails.licensePlate',
  'transportationDetails.pickupDate',
  'transportationDetails.pickupTime',
  'transportationDetails.pickupTimezone',
  'transportationDetails.pickupAddress',
  'transportationDetails.pickupNotes',
  'transportationDetails.dropoffDate',
  'transportationDetails.dropoffTime',
  'transportationDetails.dropoffTimezone',
  'transportationDetails.dropoffAddress',
  'transportationDetails.dropoffNotes',
  'transportationDetails.driverName',
  'transportationDetails.driverPhone',
  'transportationDetails.rentalPickupLocation',
  'transportationDetails.rentalDropoffLocation',
  'transportationDetails.rentalInsuranceType',
  'transportationDetails.rentalMileageLimit',
  'transportationDetails.pickupName',
  'transportationDetails.pickupLat',
  'transportationDetails.pickupLng',
  'transportationDetails.pickupPlaceId',
  'transportationDetails.dropoffName',
  'transportationDetails.dropoffLat',
  'transportationDetails.dropoffLng',
  'transportationDetails.dropoffPlaceId',
  'transportationDetails.rentalCompany',
  'transportationDetails.rentalBookingRef',
  'transportationDetails.rentalCarClass',
  'transportationDetails.rentalFuelPolicy',
  'transportationDetails.departureStation',
  'transportationDetails.arrivalStation',
  'transportationDetails.features',
  'transportationDetails.specialRequests',
  'transportationDetails.flightNumber',
  'transportationDetails.isRoundTrip',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
  'termsAndConditions',
  'cancellationPolicy',
  'supplier',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Creates default form values, handling server data hydration
 */
export function toTransportationDefaults(
  serverData?: Partial<TransportationFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string
): TransportationFormData {
  const serverDetails = serverData?.transportationDetails

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'transportation',
    name: serverData?.name ?? 'New Transportation',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',
    notes: serverData?.notes ?? '',
    confirmationNumber: serverData?.confirmationNumber ?? '',

    transportationDetails: {
      subtype: serverDetails?.subtype ?? null,
      providerName: serverDetails?.providerName ?? '',
      providerPhone: serverDetails?.providerPhone ?? '',
      providerEmail: serverDetails?.providerEmail ?? '',
      vehicleType: serverDetails?.vehicleType ?? '',
      vehicleModel: serverDetails?.vehicleModel ?? '',
      vehicleCapacity: serverDetails?.vehicleCapacity ?? null,
      licensePlate: serverDetails?.licensePlate ?? '',
      pickupDate: serverDetails?.pickupDate ?? dayDate ?? null,
      pickupTime: serverDetails?.pickupTime ?? '',
      pickupTimezone: serverDetails?.pickupTimezone ?? '',
      pickupAddress: serverDetails?.pickupAddress ?? '',
      pickupNotes: serverDetails?.pickupNotes ?? '',
      dropoffDate: serverDetails?.dropoffDate ?? null,
      dropoffTime: serverDetails?.dropoffTime ?? '',
      dropoffTimezone: serverDetails?.dropoffTimezone ?? '',
      dropoffAddress: serverDetails?.dropoffAddress ?? '',
      dropoffNotes: serverDetails?.dropoffNotes ?? '',
      driverName: serverDetails?.driverName ?? '',
      driverPhone: serverDetails?.driverPhone ?? '',
      rentalPickupLocation: serverDetails?.rentalPickupLocation ?? '',
      rentalDropoffLocation: serverDetails?.rentalDropoffLocation ?? '',
      rentalInsuranceType: serverDetails?.rentalInsuranceType ?? '',
      rentalMileageLimit: serverDetails?.rentalMileageLimit ?? '',
      pickupName: serverDetails?.pickupName ?? null,
      pickupLat: serverDetails?.pickupLat ?? null,
      pickupLng: serverDetails?.pickupLng ?? null,
      pickupPlaceId: serverDetails?.pickupPlaceId ?? null,
      dropoffName: serverDetails?.dropoffName ?? null,
      dropoffLat: serverDetails?.dropoffLat ?? null,
      dropoffLng: serverDetails?.dropoffLng ?? null,
      dropoffPlaceId: serverDetails?.dropoffPlaceId ?? null,
      rentalCompany: serverDetails?.rentalCompany ?? '',
      rentalBookingRef: serverDetails?.rentalBookingRef ?? '',
      rentalCarClass: serverDetails?.rentalCarClass ?? '',
      rentalFuelPolicy: serverDetails?.rentalFuelPolicy ?? '',
      departureStation: serverDetails?.departureStation ?? '',
      arrivalStation: serverDetails?.arrivalStation ?? '',
      legs: serverDetails?.legs ?? undefined,
      features: serverDetails?.features ?? [],
      specialRequests: serverDetails?.specialRequests ?? '',
      flightNumber: serverDetails?.flightNumber ?? '',
      isRoundTrip: serverDetails?.isRoundTrip ?? false,
    },

    totalPriceCents: serverData?.totalPriceCents ?? null,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? null,
    currency: serverData?.currency ?? tripCurrency ?? 'CAD',
    pricingType: serverData?.pricingType ?? 'flat_rate',

    commissionTotalCents: serverData?.commissionTotalCents ?? null,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? null,
    commissionExpectedDate: serverData?.commissionExpectedDate ?? null,

    termsAndConditions: serverData?.termsAndConditions ?? '',
    cancellationPolicy: serverData?.cancellationPolicy ?? '',
    supplier: serverData?.supplier ?? '',
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload with proper type conversions.
 */
export function toTransportationApiPayload(data: TransportationFormData): CreateTransportationActivityDto {
  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'transportation',
    name: data.name,
    description: data.description || null,
    proposalStatus: data.proposalStatus,
    notes: data.notes || null,
    confirmationNumber: data.confirmationNumber || null,
    transportationDetails: {
      subtype: data.transportationDetails.subtype as TransportationSubtype | null,
      providerName: data.transportationDetails.providerName || null,
      providerPhone: data.transportationDetails.providerPhone || null,
      providerEmail: data.transportationDetails.providerEmail || null,
      vehicleType: data.transportationDetails.vehicleType || null,
      vehicleModel: data.transportationDetails.vehicleModel || null,
      vehicleCapacity: data.transportationDetails.vehicleCapacity ?? null,
      licensePlate: data.transportationDetails.licensePlate || null,
      pickupDate: data.transportationDetails.pickupDate || null,
      pickupTime: data.transportationDetails.pickupTime || null,
      pickupTimezone: data.transportationDetails.pickupTimezone || null,
      pickupAddress: data.transportationDetails.pickupAddress || null,
      pickupNotes: data.transportationDetails.pickupNotes || null,
      dropoffDate: data.transportationDetails.dropoffDate || null,
      dropoffTime: data.transportationDetails.dropoffTime || null,
      dropoffTimezone: data.transportationDetails.dropoffTimezone || null,
      dropoffAddress: data.transportationDetails.dropoffAddress || null,
      dropoffNotes: data.transportationDetails.dropoffNotes || null,
      driverName: data.transportationDetails.driverName || null,
      driverPhone: data.transportationDetails.driverPhone || null,
      rentalPickupLocation: data.transportationDetails.rentalPickupLocation || null,
      rentalDropoffLocation: data.transportationDetails.rentalDropoffLocation || null,
      rentalInsuranceType: data.transportationDetails.rentalInsuranceType || null,
      rentalMileageLimit: data.transportationDetails.rentalMileageLimit || null,
      pickupName: data.transportationDetails.pickupName || null,
      pickupLat: data.transportationDetails.pickupLat ?? null,
      pickupLng: data.transportationDetails.pickupLng ?? null,
      pickupPlaceId: data.transportationDetails.pickupPlaceId || null,
      dropoffName: data.transportationDetails.dropoffName || null,
      dropoffLat: data.transportationDetails.dropoffLat ?? null,
      dropoffLng: data.transportationDetails.dropoffLng ?? null,
      dropoffPlaceId: data.transportationDetails.dropoffPlaceId || null,
      rentalCompany: data.transportationDetails.rentalCompany || null,
      rentalBookingRef: data.transportationDetails.rentalBookingRef || null,
      rentalCarClass: data.transportationDetails.rentalCarClass || null,
      rentalFuelPolicy: data.transportationDetails.rentalFuelPolicy || null,
      departureStation: data.transportationDetails.departureStation || null,
      arrivalStation: data.transportationDetails.arrivalStation || null,
      // Empty array sent as null so the JSONB column distinguishes
      // "no multi-leg" from "explicitly cleared".
      legs: (data.transportationDetails.legs?.length ?? 0) > 0 ? data.transportationDetails.legs : null,
      features: data.transportationDetails.features || null,
      specialRequests: data.transportationDetails.specialRequests || null,
      flightNumber: data.transportationDetails.flightNumber || null,
      isRoundTrip: data.transportationDetails.isRoundTrip ?? false,
    },
    totalPriceCents: data.totalPriceCents ?? null,
    taxesAndFeesCents: data.taxesAndFeesCents ?? null,
    currency: data.currency,
    pricingType: data.pricingType as PricingType,
    // Commission fields
    commissionTotalCents: data.commissionTotalCents ?? undefined,
    commissionSplitPercentage: data.commissionSplitPercentage ?? undefined,
    commissionExpectedDate: data.commissionExpectedDate || undefined,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
  }
}
