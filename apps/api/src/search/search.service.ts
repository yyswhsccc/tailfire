import { Injectable } from '@nestjs/common'
import { TripsService } from '../trips/trips.service'
import { TripAccessService } from '../trips/trip-access.service'
import { ContactsService } from '../contacts/contacts.service'
import { ContactAccessService } from '../contacts/contact-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  SearchResponseDto,
  TripSearchResult,
  ContactSearchResult,
  SearchResultGroup,
} from '@tailfire/shared-types'

@Injectable()
export class SearchService {
  constructor(
    private readonly tripsService: TripsService,
    private readonly tripAccessService: TripAccessService,
    private readonly contactsService: ContactsService,
    private readonly contactAccessService: ContactAccessService,
  ) {}

  async search(q: string, limit: number, auth: AuthContext): Promise<SearchResponseDto> {
    const [tripsResult, contactsResult] = await Promise.allSettled([
      this.searchTrips(q, limit, auth),
      this.searchContacts(q, limit, auth),
    ])

    return {
      trips: tripsResult.status === 'fulfilled'
        ? tripsResult.value
        : { items: [], hasMore: false },
      contacts: contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : { items: [], hasMore: false },
    }
  }

  private async searchTrips(
    q: string,
    limit: number,
    auth: AuthContext,
  ): Promise<SearchResultGroup<TripSearchResult>> {
    const result = await this.tripsService.findAll(
      { search: q, limit: limit + 1, page: 1 },
      auth,
      this.tripAccessService,
    )

    const hasMore = result.data.length > limit
    const items: TripSearchResult[] = result.data.slice(0, limit).map((trip) => ({
      id: trip.id,
      type: 'trip' as const,
      title: trip.name,
      subtitle: trip.referenceNumber || undefined,
      status: trip.status,
      url: `/trips/${trip.id}`,
      referenceNumber: trip.referenceNumber || undefined,
      startDate: trip.startDate || undefined,
      endDate: trip.endDate || undefined,
    }))

    return { items, hasMore }
  }

  private async searchContacts(
    q: string,
    limit: number,
    auth: AuthContext,
  ): Promise<SearchResultGroup<ContactSearchResult>> {
    const result = await this.contactsService.findAll(
      { search: q, limit: limit + 1, page: 1 },
      auth.agencyId,
      auth.userId,
    )

    const accessControlled = await this.contactAccessService.applyAccessControlToMany(
      result.data,
      auth,
    )

    // Note: hasMore may be inaccurate for non-admin users because
    // applyAccessControlToMany() can filter out some of the limit+1 results.
    // This matches the existing controller behavior and is acceptable for v1.
    const hasMore = accessControlled.length > limit
    const items: ContactSearchResult[] = accessControlled.slice(0, limit).map((contact) => ({
      id: contact.id,
      type: 'contact' as const,
      title: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      subtitle: contact.email || undefined,
      url: `/contacts/${contact.id}`,
      email: contact.email || undefined,
      phone: contact.phone || undefined,
    }))

    return { items, hasMore }
  }
}
