/**
 * Schemas Index
 *
 * Re-exports all Zod schemas for validation.
 *
 * Type Export Strategy:
 * - Enum types and common types are exported here (canonical source)
 * - Component detail types (FlightDetailsDto, LodgingDetailsDto, etc.) are defined
 *   in ./api/components.types.ts to avoid duplication. Only schemas are exported here.
 * - Exception: TransportationDetailsDto is exported here for backwards compatibility
 *   since it was the first schema created and is imported from this location.
 */

// Enums
export {
  activityTypeSchema,
  type ActivityType,
  activityProposalStatusSchema,
  type ActivityProposalStatus,
  activityBookingStatusSchema,
  type ActivityBookingStatus,
  // Backward compatibility aliases
  activityStatusSchema,
  type ActivityStatus,
  pricingTypeSchema,
  type PricingType,
  portTypeSchema,
  type PortType,
  transportationSubtypeSchema,
  type TransportationSubtype,
} from './enums.schema'

// Common schemas
export {
  coordinatesSchema,
  type Coordinates,
  photoSchema,
  type Photo,
} from './common.schema'

// Activity schemas
export {
  createActivityDtoSchema,
  type CreateActivityDto,
  updateActivityDtoSchema,
  type UpdateActivityDto,
} from './activity.schema'

// =============================================================================
// Component Detail Schemas
// =============================================================================

// Transportation (includes type for backwards compatibility)
export {
  transportationDetailsDtoSchema,
  type TransportationDetailsDto,
} from './transportation.schema'

// Flight (schema only - type is in api/components.types.ts)
export { flightSegmentDtoSchema, flightDetailsDtoSchema } from './flight-details.schema'

// Lodging (schema only - type is in api/components.types.ts)
export { lodgingDetailsDtoSchema } from './lodging-details.schema'

// Dining (schema only - type is in api/components.types.ts)
export { diningDetailsDtoSchema } from './dining-details.schema'

// Options (schema only - type is in api/components.types.ts)
export { optionCategorySchema, optionsDetailsDtoSchema } from './options-details.schema'

// Port Info (schema only - type is in api/components.types.ts)
export { portInfoDetailsDtoSchema } from './port-info-details.schema'

// Custom Cruise (schema only - type is in api/components.types.ts)
export {
  cruiseSourceSchema,
  cabinCategorySchema,
  cruisePortCallSchema,
  customCruiseDetailsDtoSchema,
} from './custom-cruise-details.schema'

// Custom Tour (schema only - type is in api/components.types.ts)
export {
  tourItineraryDaySchema,
  tourHotelSchema,
  tourInclusionSchema,
  customTourDetailsDtoSchema,
  tourDayDetailsDtoSchema,
} from './custom-tour-details.schema'

// =============================================================================
// Component Request Schemas (for request body validation)
// =============================================================================

export {
  // Flight
  createFlightComponentDtoSchema,
  updateFlightComponentDtoSchema,
  // Lodging
  createLodgingComponentDtoSchema,
  updateLodgingComponentDtoSchema,
  // Transportation
  createTransportationComponentDtoSchema,
  updateTransportationComponentDtoSchema,
  // Dining
  createDiningComponentDtoSchema,
  updateDiningComponentDtoSchema,
  // Port Info
  createPortInfoComponentDtoSchema,
  updatePortInfoComponentDtoSchema,
  // Options
  createOptionsComponentDtoSchema,
  updateOptionsComponentDtoSchema,
  // Custom Cruise
  createCustomCruiseComponentDtoSchema,
  updateCustomCruiseComponentDtoSchema,
  // Custom Tour
  createCustomTourComponentDtoSchema,
  updateCustomTourComponentDtoSchema,
  // Tour Day
  createTourDayComponentDtoSchema,
  updateTourDayComponentDtoSchema,
} from './component-requests.schema'

// =============================================================================
// Template Schemas (Itinerary & Package Library)
// =============================================================================

// Itinerary Templates
export {
  // Sub-schemas (shared)
  templateCoordinatesSchema,
  templatePricingSchema,
  templatePaymentItemSchema,
  templatePaymentScheduleSchema,
  templateMediaSchema,
  templateActivitySchema,
  type TemplateActivity,
  templateDayOffsetSchema,
  // Payload
  itineraryTemplatePayloadSchema,
  type ItineraryTemplatePayload,
  // CRUD
  createItineraryTemplateSchema,
  type CreateItineraryTemplateDto,
  updateItineraryTemplateSchema,
  type UpdateItineraryTemplateDto,
  // Apply
  applyItineraryTemplateSchema,
  type ApplyItineraryTemplateDto,
  // Save as Template
  saveItineraryAsTemplateSchema,
  type SaveItineraryAsTemplateDto,
} from './itinerary-template.schema'

// Package Templates
export {
  // Metadata
  packageTemplateMetadataSchema,
  type PackageTemplateMetadata,
  // Payload
  packageTemplatePayloadSchema,
  type PackageTemplatePayload,
  // CRUD
  createPackageTemplateSchema,
  type CreatePackageTemplateDto,
  updatePackageTemplateSchema,
  type UpdatePackageTemplateDto,
  // Apply
  applyPackageTemplateSchema,
  type ApplyPackageTemplateDto,
  // Save as Template
  savePackageAsTemplateSchema,
  type SavePackageAsTemplateDto,
} from './package-template.schema'
