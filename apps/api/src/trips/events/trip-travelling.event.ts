/**
 * Domain Event: Trip Travelling
 *
 * Emitted when a trip transitions to 'travelling' status.
 * Can be triggered by:
 * - Automatic scheduler (when start date is reached)
 * - Manual status change by user
 */

export class TripTravellingEvent {
  constructor(
    public readonly tripId: string,
    public readonly tripName: string,
    public readonly primaryContactId: string | null,
    public readonly agencyId: string,
    /** True if this was an automatic transition by the scheduler */
    public readonly isAutoTransition: boolean,
    /** The trip's start date */
    public readonly startDate: string | null,
  ) {}
}
