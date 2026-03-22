/**
 * Domain Event: Trip Active
 *
 * Emitted when a trip transitions to 'active' status.
 * Allows decoupled services to react to booking events without direct dependencies.
 *
 * Example: ContactsService listens for this event to set first booking date.
 */

export class TripActiveEvent {
  constructor(
    public readonly tripId: string,
    public readonly primaryContactId: string | null,
    public readonly bookingDate: string,
  ) {}
}
