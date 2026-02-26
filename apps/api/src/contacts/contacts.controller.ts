/**
 * Contacts Controller
 *
 * REST API endpoints for Contact management.
 * Uses ContactAccessService for access control including contact shares.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContactsService } from './contacts.service'
import { ContactAccessService } from './contact-access.service'
import { ActivityLogsService } from '../activity-logs/activity-logs.service'
import { TripAccessService } from '../trips/trip-access.service'
import { PaymentSchedulesService } from '../trips/payment-schedules.service'
import {
  CreateContactDto,
  UpdateContactDto,
  ContactFilterDto,
} from './dto'
import type {
  ContactResponseDto,
  PaginatedContactsResponseDto,
  UpdateContactOwnerDto,
  PortalInviteResponseDto,
} from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

@ApiTags('Contacts')
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly contactAccessService: ContactAccessService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly tripAccessService: TripAccessService,
    private readonly paymentSchedulesService: PaymentSchedulesService,
  ) {}

  /**
   * Create a new contact
   * POST /contacts
   * - Admins can create agency-wide contacts (null owner_id)
   * - Users must create contacts they own
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateContactDto
  ): Promise<ContactResponseDto> {
    // Users must set themselves as owner
    if (auth.role !== 'admin' && !dto.ownerId) {
      dto.ownerId = auth.userId
    }
    // Users cannot create agency-wide contacts (null owner)
    if (auth.role !== 'admin' && dto.ownerId !== auth.userId) {
      throw new ForbiddenException('Users can only create contacts they own')
    }
    return this.contactsService.create(dto, auth.agencyId, auth.userId)
  }

  /**
   * Get all contacts with filtering and pagination
   * GET /contacts?page=1&limit=20&search=john&isActive=true
   * Applies limited view filter for non-owners
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: ContactFilterDto
  ): Promise<PaginatedContactsResponseDto> {
    const result = await this.contactsService.findAll(filters, auth.agencyId, auth.userId)
    // Apply access control filtering using ContactAccessService (includes shares)
    const filteredData = await this.contactAccessService.applyAccessControlToMany(result.data, auth)
    return {
      ...result,
      data: filteredData,
    }
  }

  /**
   * Get filter options for contacts
   * GET /contacts/filter-options
   *
   * Returns tag names actually in use on contacts (visibility-scoped).
   */
  @Get('filter-options')
  async getFilterOptions(@GetAuthContext() auth: AuthContext): Promise<{ tags: string[] }> {
    return this.contactsService.getContactFilterOptions(auth.agencyId, auth.userId)
  }

  /**
   * Get trips associated with a contact
   * GET /contacts/:id/trips
   */
  @Get(':id/trips')
  async getTrips(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.contactsService.getTripsForContact(id, auth.agencyId)
  }

  /**
   * Get booked activities for a contact
   * GET /contacts/:id/bookings
   * Returns all booked activities across trips where the contact is a traveler
   */
  @Get(':id/bookings')
  async getBookings(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.contactsService.findOne(id, auth.agencyId)
    return this.contactsService.getBookingsForContact(id, auth.agencyId)
  }

  /**
   * Get activity timeline for a contact
   * GET /contacts/:id/activity
   * Returns combined timeline of contact changes and related trip activity
   */
  @Get(':id/activity')
  async getActivity(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    // Verify contact exists and user has access
    await this.contactsService.findOne(id, auth.agencyId)
    // Get accessible trip IDs for the current user
    const accessibleTripIds = await this.tripAccessService.getAccessibleTripIds(auth)
    const parsedLimit = limit ? Number(limit) : 50
    const parsedOffset = offset ? Number(offset) : 0
    return this.activityLogsService.getActivityForContact(id, auth.agencyId, accessibleTripIds, parsedLimit, parsedOffset)
  }

  /**
   * Get payment transactions for a contact across all their trips
   * GET /contacts/:contactId/payment-transactions
   */
  @Get(':contactId/payment-transactions')
  async getContactPaymentTransactions(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ) {
    // Verify contact access
    await this.contactsService.findOne(contactId, auth.agencyId)
    return this.paymentSchedulesService.getContactPaymentTransactions(contactId, auth.agencyId)
  }

  /**
   * Get a single contact by ID
   * GET /contacts/:id
   * Applies limited view filter for non-owners
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<ContactResponseDto> {
    const contact = await this.contactsService.findOne(id, auth.agencyId)
    // Apply access control filtering using ContactAccessService (includes shares)
    return this.contactAccessService.applyAccessControl(contact, auth)
  }

  /**
   * Update a contact
   * PUT /contacts/:id
   * - Admins can update any contact
   * - Users can only update contacts they own
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    // Check ownership or full share access for non-admins
    if (auth.role !== 'admin') {
      const accessResult = await this.contactAccessService.canAccessSensitiveData(id, auth)
      if (!accessResult.canAccessSensitive) {
        throw new ForbiddenException('You can only update contacts you own or have full access to')
      }
    }
    return this.contactsService.update(id, dto, auth.agencyId, auth.userId)
  }

  /**
   * Soft delete a contact
   * DELETE /contacts/:id
   * - Admins can delete any contact
   * - Users can only delete contacts they own
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only delete contacts you own')
      }
    }
    return this.contactsService.remove(id, auth.agencyId, auth.userId)
  }

  /**
   * Hard delete a contact (permanent)
   * DELETE /contacts/:id/permanent
   * - Admins can delete any contact
   * - Users can only delete contacts they own
   */
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDelete(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only delete contacts you own')
      }
    }
    return this.contactsService.hardDelete(id, auth.agencyId)
  }

  /**
   * Promote a lead to client
   * POST /contacts/:id/promote-to-client
   * - Admins can promote any contact
   * - Users can only promote contacts they own or agency-wide contacts
   */
  @Post(':id/promote-to-client')
  async promoteToClient(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ContactResponseDto> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== null && existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only promote contacts you own')
      }
    }
    return this.contactsService.promoteToClient(id, auth.agencyId, auth.userId)
  }

  /**
   * Update contact status
   * PATCH /contacts/:id/status
   * - Admins can update any contact's status
   * - Users can only update status of contacts they own or agency-wide contacts
   */
  @Patch(':id/status')
  async updateStatus(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: { status: string },
  ): Promise<ContactResponseDto> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== null && existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only update status of contacts you own')
      }
    }
    return this.contactsService.updateStatus(id, dto.status, auth.agencyId, auth.userId)
  }

  /**
   * Update marketing consent
   * PATCH /contacts/:id/marketing-consent
   * - Admins can update any contact's marketing consent
   * - Users can only update marketing consent of contacts they own or agency-wide contacts
   */
  @Patch(':id/marketing-consent')
  async updateMarketingConsent(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<ContactResponseDto> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== null && existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only update marketing consent of contacts you own')
      }
    }
    return this.contactsService.updateMarketingConsent(id, dto, auth.agencyId)
  }

  /**
   * Send portal invitation to a contact
   * POST /contacts/:id/portal-invite
   * - Admins can invite any contact
   * - Users can only invite contacts they own
   */
  @Post(':id/portal-invite')
  async sendPortalInvite(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PortalInviteResponseDto> {
    // Check ownership for non-admins
    if (auth.role !== 'admin') {
      const existing = await this.contactsService.findOne(id, auth.agencyId)
      if (existing.ownerId !== null && existing.ownerId !== auth.userId) {
        throw new ForbiddenException('You can only invite contacts you own')
      }
    }
    return this.contactsService.sendPortalInvite(id, auth.userId, auth.agencyId)
  }

  /**
   * Re-assign contact ownership (Admin only)
   * PATCH /contacts/:id/owner
   * - Only admins can change contact ownership
   * - Can set to any user in the agency or null (agency-wide)
   */
  @Patch(':id/owner')
  async updateOwner(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateContactOwnerDto,
  ): Promise<ContactResponseDto> {
    if (auth.role !== 'admin') {
      throw new ForbiddenException('Only admins can re-assign contact ownership')
    }
    return this.contactsService.updateOwner(id, dto.ownerId, auth.agencyId)
  }
}
