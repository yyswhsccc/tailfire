/**
 * Domain Event: Trip Completed
 *
 * Emitted when a trip transitions to 'completed' status.
 * Can be triggered by:
 * - Automatic scheduler (day after end date)
 * - Manual status change by user
 */

export class TripCompletedEvent {
  constructor(
    public readonly tripId: string,
    public readonly tripName: string,
    public readonly primaryContactId: string | null,
    /** True if this was an automatic transition by the scheduler */
    public readonly isAutoTransition: boolean,
    /** The trip's end date */
    public readonly endDate: string | null,
  ) {}
}
