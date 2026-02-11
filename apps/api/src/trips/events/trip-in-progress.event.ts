/**
 * Domain Event: Trip In Progress
 *
 * Emitted when a trip transitions to 'in_progress' status.
 * Can be triggered by:
 * - Automatic scheduler (when start date is reached)
 * - Manual status change by user
 */

export class TripInProgressEvent {
  constructor(
    public readonly tripId: string,
    public readonly tripName: string,
    public readonly primaryContactId: string | null,
    /** True if this was an automatic transition by the scheduler */
    public readonly isAutoTransition: boolean,
    /** The trip's start date */
    public readonly startDate: string | null,
  ) {}
}
