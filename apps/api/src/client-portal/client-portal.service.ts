import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { eq, and, or, desc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { TripsService } from '../trips/trips.service'

@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly tripsService: TripsService,
  ) {}

  /**
   * Verify contact exists and matches auth context.
   * Uses auth.contactId directly (NOT client_portal_users lookup).
   */
  async resolveContact(contactId: string, agencyId: string) {
    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        agencyId: this.db.schema.contacts.agencyId,
      })
      .from(this.db.schema.contacts)
      .where(
        and(
          eq(this.db.schema.contacts.id, contactId),
          eq(this.db.schema.contacts.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal contact not found')
    }

    return contact
  }

  /**
   * Verify the contact has access to the trip (traveler or primary contact).
   * Enforces agency scope on both paths.
   */
  async verifyTripAccess(contactId: string, agencyId: string, tripId: string) {
    // Check traveler link
    const [traveler] = await this.db.client
      .select({ role: this.db.schema.tripTravelers.role })
      .from(this.db.schema.tripTravelers)
      .where(
        and(
          eq(this.db.schema.tripTravelers.tripId, tripId),
          eq(this.db.schema.tripTravelers.contactId, contactId),
        ),
      )
      .limit(1)

    if (traveler) return

    // Check primary contact
    const [trip] = await this.db.client
      .select({ id: this.db.schema.trips.id })
      .from(this.db.schema.trips)
      .where(
        and(
          eq(this.db.schema.trips.id, tripId),
          eq(this.db.schema.trips.primaryContactId, contactId),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!trip) {
      throw new ForbiddenException('You do not have access to this trip')
    }
  }
}
