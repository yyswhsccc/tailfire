/**
 * Domain Event: Trip Cancelled
 *
 * Emitted when a trip is cancelled.
 * Includes the cancellation reason for audit trail.
 */

export class TripCancelledEvent {
  constructor(
    public readonly tripId: string,
    public readonly tripName: string,
    public readonly primaryContactId: string | null,
    /** The user who cancelled the trip */
    public readonly cancelledBy: string | null,
    /** Optional cancellation reason */
    public readonly cancellationReason: string | null,
    /** The trip's previous status before cancellation */
    public readonly previousStatus: string,
    /** Whether to send cancellation email to travelers */
    public readonly notifyTravelers: boolean = false,
  ) {}
}
