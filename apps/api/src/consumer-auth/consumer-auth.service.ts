/**
 * Consumer Auth Service
 *
 * Handles consumer portal registration:
 * 1. Creates or finds a contact record (contactType='lead', contactStatus='prospecting')
 * 2. Creates a Supabase auth user with app_metadata: { portal_user: true, contact_id, agency_id }
 * 3. Links contact.portalUserId to the new auth user
 * 4. Returns a generic success message (consumer signs in via portal login)
 *
 * All response paths return the same shape to prevent account enumeration.
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { eq, and, isNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { RegisterConsumerDto } from './dto/register-consumer.dto'

/** Generic response to prevent account enumeration */
const GENERIC_RESPONSE = {
  message: 'If this email is associated with an account, you can sign in at my.phoenixvoyages.ca.',
}

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name)
  private readonly supabaseAdmin: SupabaseClient

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }

    this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  /**
   * Register a consumer.
   *
   * - New contact: creates contact + auth user
   * - Existing contact without portal user: creates auth user
   * - Existing contact with portal user: no-op
   *
   * All paths return the same generic message to prevent account enumeration.
   * The consumer signs in via the portal login page (signInWithOtp).
   */
  async registerConsumer(dto: RegisterConsumerDto) {
    const email = dto.email.toLowerCase().trim()

    // 1. Check for existing contact by email
    const existingContact = await this.db.client.query.contacts.findFirst({
      where: eq(this.db.schema.contacts.email, email),
    })

    let contactId: string
    let portalUserId: string | null = null

    if (!existingContact) {
      // 2. No contact found — create a new lead
      const agencyId = await this.getDefaultAgencyId()

      // DB has a check_has_name constraint requiring first_name (or legal_first_name
      // or preferred_name) to be NOT NULL. last_name alone is not enough — derive
      // first_name from the email prefix whenever firstName is missing.
      let firstName = dto.firstName?.trim() || null
      const lastName = dto.lastName?.trim() || null
      if (!firstName) {
        const emailPrefix = email.split('@')[0] || 'Consumer'
        const derived = emailPrefix.split(/[._-]/)[0] || 'Consumer'
        firstName = derived.charAt(0).toUpperCase() + derived.slice(1)
      }

      const [newContact] = await this.db.client
        .insert(this.db.schema.contacts)
        .values({
          email,
          firstName,
          lastName,
          contactType: 'lead',
          contactStatus: 'prospecting',
          authMethod: 'magic_link',
          agencyId,
        })
        .returning({ id: this.db.schema.contacts.id })

      contactId = newContact!.id
      this.logger.log(`Created new contact ${contactId} for consumer registration`)
    } else {
      contactId = existingContact.id
      portalUserId = existingContact.portalUserId

      if (portalUserId) {
        // Already has a portal user — nothing to do, return generic response
        this.logger.log(`Existing portal user found for contact ${contactId}`)
        return GENERIC_RESPONSE
      }
    }

    // 3. New user or contact without portal user — create auth user
    const agencyId = existingContact?.agencyId ?? await this.getDefaultAgencyId()

    const { data: userData, error: userError } = await this.supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        portal_user: true,
        contact_id: contactId,
        agency_id: agencyId,
      },
      user_metadata: {
        first_name: dto.firstName || null,
        last_name: dto.lastName || null,
      },
    })

    if (userError) {
      // Handle "User already registered" — auth user exists but wasn't linked to contact
      if (userError.message?.includes('already been registered') || userError.message?.includes('already exists')) {
        this.logger.warn(`Auth user already exists for ${email}, linking to contact ${contactId}`)
        // Look up existing auth user by email
        const { data: existingUsers } = await this.supabaseAdmin.auth.admin.listUsers()
        const existingAuthUser = existingUsers?.users?.find((u) => u.email === email)
        if (existingAuthUser) {
          // Link existing auth user to contact
          await this.db.client
            .update(this.db.schema.contacts)
            .set({ portalUserId: existingAuthUser.id, authMethod: 'magic_link', updatedAt: new Date() })
            .where(eq(this.db.schema.contacts.id, contactId))

          // Backfill contactId on any session-linked trip requests
          if (dto.sessionId) {
            try {
              const { otaTripRequests } = this.db.schema
              await this.db.client
                .update(otaTripRequests)
                .set({ contactId, contactEmail: email, updatedAt: new Date() })
                .where(
                  and(
                    eq(otaTripRequests.sessionId, dto.sessionId),
                    isNull(otaTripRequests.contactId),
                  ),
                )
              this.logger.log(`Backfilled session ${dto.sessionId} trip requests with contactId ${contactId}`)
            } catch (err) {
              this.logger.warn(`Failed to backfill session trip requests: ${(err as Error).message}`)
            }

            // Also backfill consumer_activity events
            try {
              const { consumerActivity } = this.db.schema
              await this.db.client
                .update(consumerActivity)
                .set({ contactId })
                .where(
                  and(
                    eq(consumerActivity.sessionId, dto.sessionId),
                    isNull(consumerActivity.contactId),
                  ),
                )
              this.logger.log(`Backfilled consumer_activity for session ${dto.sessionId}`)
            } catch (err) {
              this.logger.warn(`Failed to backfill consumer_activity: ${(err as Error).message}`)
            }
          }

          return GENERIC_RESPONSE
        }
      }
      this.logger.error(`Failed to create auth user: ${userError.message}`)
      throw new InternalServerErrorException('Failed to create portal account')
    }

    if (!userData.user) {
      this.logger.error('Supabase createUser returned no user data')
      throw new InternalServerErrorException('Failed to create portal account')
    }

    const newUserId = userData.user.id

    // 4. Link portalUserId on contact (portalActivatedAt set on first login, not registration)
    try {
      await this.db.client
        .update(this.db.schema.contacts)
        .set({
          portalUserId: newUserId,
          authMethod: 'magic_link',
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.contacts.id, contactId))
    } catch (dbError) {
      // Rollback: delete auth user if contact update fails
      await this.supabaseAdmin.auth.admin.deleteUser(newUserId)
      this.logger.error('Failed to link portal user to contact, rolled back auth user')
      throw new InternalServerErrorException('Failed to link portal account')
    }

    this.logger.log(`Consumer registered: contact=${contactId}, authUser=${newUserId}`)

    // Backfill contactId on any session-linked trip requests
    if (dto.sessionId) {
      try {
        const { otaTripRequests } = this.db.schema
        await this.db.client
          .update(otaTripRequests)
          .set({ contactId, contactEmail: email, updatedAt: new Date() })
          .where(
            and(
              eq(otaTripRequests.sessionId, dto.sessionId),
              isNull(otaTripRequests.contactId),
            ),
          )
        this.logger.log(`Backfilled session ${dto.sessionId} trip requests with contactId ${contactId}`)
      } catch (err) {
        this.logger.warn(`Failed to backfill session trip requests: ${(err as Error).message}`)
      }

      // Also backfill consumer_activity events
      try {
        const { consumerActivity } = this.db.schema
        await this.db.client
          .update(consumerActivity)
          .set({ contactId })
          .where(
            and(
              eq(consumerActivity.sessionId, dto.sessionId),
              isNull(consumerActivity.contactId),
            ),
          )
        this.logger.log(`Backfilled consumer_activity for session ${dto.sessionId}`)
      } catch (err) {
        this.logger.warn(`Failed to backfill consumer_activity: ${(err as Error).message}`)
      }
    }

    return GENERIC_RESPONSE
  }

  /**
   * Get the default agency ID (first agency in the system).
   * Phoenix Voyages is a single-agency platform.
   */
  private async getDefaultAgencyId(): Promise<string> {
    const agency = await this.db.client.query.agencies.findFirst()

    if (!agency) {
      this.logger.error('No agency found in the system')
      throw new InternalServerErrorException('System configuration error: no agency found')
    }

    return agency.id
  }
}
