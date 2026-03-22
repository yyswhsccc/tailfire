/**
 * Port Info Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles date coercion and nested object validation.
 */

import { z } from 'zod'
import type { CreatePortInfoActivityDto } from '@tailfire/shared-types/api'

// ============================================================================
// Port Info Details Schema (nested object)
// ============================================================================

export const portInfoDetailsSchema = z.object({
  portName: z.string().min(1, 'Port name is required'),
  portLocation: z.string().optional().default(''),
  arrivalDate: z.string().nullable().optional(),
  arrivalTime: z.string().optional().default('08:00'),
  departureDate: z.string().nullable().optional(),
  departureTime: z.string().optional().default('18:00'),
  timezone: z.string().optional().default(''),
  dockName: z.string().optional().default(''),
  address: z.string().optional().default(''),
  coordinates: z.any().nullable().optional(),
  phone: z.string().optional().default(''),
  website: z.string().optional().default(''),
  excursionNotes: z.string().optional().default(''),
  tenderRequired: z.boolean().default(false),
  specialRequests: z.string().optional().default(''),
})

// ============================================================================
// Main Port Info Form Schema
// ============================================================================

export const portInfoFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('port_info').default('port_info'),
  name: z.string().optional().default(''), // Auto-generated from portName
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Nested port info details
  portInfoDetails: portInfoDetailsSchema,
})

export type PortInfoFormData = z.infer<typeof portInfoFormSchema>
export type PortInfoDetailsData = z.infer<typeof portInfoDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const PORT_INFO_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'portInfoDetails',
  'portInfoDetails.portName',
  'portInfoDetails.portLocation',
  'portInfoDetails.arrivalDate',
  'portInfoDetails.arrivalTime',
  'portInfoDetails.departureDate',
  'portInfoDetails.departureTime',
  'portInfoDetails.timezone',
  'portInfoDetails.dockName',
  'portInfoDetails.address',
  'portInfoDetails.phone',
  'portInfoDetails.website',
  'portInfoDetails.excursionNotes',
  'portInfoDetails.tenderRequired',
  'portInfoDetails.specialRequests',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Creates default form values, handling server data hydration
 */
export function toPortInfoDefaults(
  serverData?: Partial<PortInfoFormData> | null,
  dayDate?: string | null
): PortInfoFormData {
  const serverDetails = serverData?.portInfoDetails

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'port_info',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    portInfoDetails: {
      portName: serverDetails?.portName ?? '',
      portLocation: serverDetails?.portLocation ?? '',
      arrivalDate: serverDetails?.arrivalDate ?? dayDate ?? null,
      arrivalTime: serverDetails?.arrivalTime ?? '08:00',
      departureDate: serverDetails?.departureDate ?? dayDate ?? null,
      departureTime: serverDetails?.departureTime ?? '18:00',
      timezone: serverDetails?.timezone ?? '',
      dockName: serverDetails?.dockName ?? '',
      address: serverDetails?.address ?? '',
      coordinates: serverDetails?.coordinates ?? null,
      phone: serverDetails?.phone ?? '',
      website: serverDetails?.website ?? '',
      excursionNotes: serverDetails?.excursionNotes ?? '',
      tenderRequired: serverDetails?.tenderRequired ?? false,
      specialRequests: serverDetails?.specialRequests ?? '',
    },
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload with proper type conversions.
 */
export function toPortInfoApiPayload(data: PortInfoFormData): CreatePortInfoActivityDto {
  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'port_info',
    name: data.portInfoDetails.portName, // Auto-name from port
    description: data.description,
    status: data.status,
    portInfoDetails: {
      portName: data.portInfoDetails.portName,
      portLocation: data.portInfoDetails.portLocation,
      arrivalDate: data.portInfoDetails.arrivalDate,
      arrivalTime: data.portInfoDetails.arrivalTime,
      departureDate: data.portInfoDetails.departureDate,
      departureTime: data.portInfoDetails.departureTime,
      timezone: data.portInfoDetails.timezone,
      dockName: data.portInfoDetails.dockName,
      address: data.portInfoDetails.address,
      coordinates: data.portInfoDetails.coordinates,
      phone: data.portInfoDetails.phone,
      website: data.portInfoDetails.website,
      excursionNotes: data.portInfoDetails.excursionNotes,
      tenderRequired: data.portInfoDetails.tenderRequired,
      specialRequests: data.portInfoDetails.specialRequests,
    },
  }
}
