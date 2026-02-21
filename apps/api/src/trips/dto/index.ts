/**
 * Barrel export for all Trip DTOs
 */

// Trip DTOs
export { CreateTripDto } from './create-trip.dto'
export { UpdateTripDto } from './update-trip.dto'
export { TripFilterDto } from './trip-filter.dto'

// Trip Traveler DTOs
export { CreateTripTravelerDto, ContactSnapshotDto, EmergencyContactInlineDto } from './create-trip-traveler.dto'
export { UpdateTripTravelerDto } from './update-trip-traveler.dto'
export { TripTravelerFilterDto } from './trip-traveler-filter.dto'

// Itinerary DTOs
export { CreateItineraryDto } from './create-itinerary.dto'
export { UpdateItineraryDto } from './update-itinerary.dto'
export { ItineraryFilterDto } from './itinerary-filter.dto'

// Traveler Group DTOs
export { CreateTravelerGroupDto } from './create-traveler-group.dto'
export { UpdateTravelerGroupDto } from './update-traveler-group.dto'
export { TravelerGroupFilterDto } from './traveler-group-filter.dto'
export { AddTravelerToGroupDto } from './add-traveler-to-group.dto'
export { UpdateTravelerGroupMemberDto } from './update-traveler-group-member.dto'

// Collaborator DTOs
export { CreateTripCollaboratorDto } from './create-trip-collaborator.dto'
export { UpdateTripCollaboratorDto } from './update-trip-collaborator.dto'

// Bulk Operation DTOs
export {
  BulkDeleteTripsDto,
  BulkArchiveTripsDto,
  BulkChangeStatusDto,
  type BulkTripOperationResult,
  type TripFilterOptionsResponseDto,
} from './bulk-trip-operations.dto'

// Activity Bookings DTOs
export { MarkActivityBookedDto, ActivityBookingsFilterDto } from './activity-bookings.dto'

// Trip Share DTOs
export { CreateTripShareDto, UpdateTripShareDto } from './create-trip-share.dto'

// Email DTOs
export { SendBookingConfirmationDto } from './send-booking-confirmation.dto'

// Proposal Comment DTOs
export { CreateProposalCommentDto } from './proposal-comment.dto'

// Publish Itinerary DTOs
export { PublishItineraryBodyDto } from './publish-itinerary.dto'

// Activity Response DTOs
export { CreateActivityResponseDto } from './create-activity-response.dto'

// Itinerary Selection DTOs
export { SelectItineraryDto } from './select-itinerary.dto'
