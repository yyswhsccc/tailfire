/**
 * Domain Event: Trip Travelled
 *
 * Emitted when a trip transitions to 'travelled' status.
 * Can be triggered by:
 * - Automatic scheduler (day after end date)
 * - Manual status change by user
 */

export class TripTravelledEvent {
  constructor(
    public readonly tripId: string,
    public readonly tripName: string,
    public readonly primaryContactId: string | null,
    public readonly agencyId: string,
    /** True if this was an automatic transition by the scheduler */
    public readonly isAutoTransition: boolean,
    /** The trip's end date */
    public readonly endDate: string | null,
  ) {}
}
