/**
 * Consumer Auth Service
 *
 * Handles consumer portal registration:
 * 1. Creates or finds a contact record (contactType='lead', contactStatus='prospecting')
 * 2. Creates a Supabase auth user with app_metadata: { portal_user: true, contact_id, agency_id }
 * 3. Links contact.portalUserId to the new auth user
 * 4. Generates and returns a magic link URL
 * 5. If contact already has portalUserId, just sends a new magic link (existing user)
 * 6. Rolls back auth user creation if magic link generation fails
 */

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { RegisterConsumerDto } from './dto/register-consumer.dto'

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name)
  private readonly supabaseAdmin: SupabaseClient
  private readonly portalBaseUrl: string

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

    this.portalBaseUrl = this.configService.get<string>('CLIENT_PORTAL_URL') || 'http://localhost:3102'
  }

  /**
   * Register or re-authenticate a consumer.
   *
   * - New contact: creates contact + auth user + magic link
   * - Existing contact without portal user: creates auth user + magic link
   * - Existing contact with portal user: generates new magic link only
   */
  async registerConsumer(dto: RegisterConsumerDto) {
    const email = dto.email.toLowerCase().trim()

    // 1. Check for existing contact by email
    const existingContact = await this.db.client.query.contacts.findFirst({
      where: eq(this.db.schema.contacts.email, email),
    })

    let contactId: string
    let portalUserId: string | null = null
    let isExistingUser = false

    if (!existingContact) {
      // 2. No contact found — create a new lead
      const agencyId = await this.getDefaultAgencyId()

      const [newContact] = await this.db.client
        .insert(this.db.schema.contacts)
        .values({
          email,
          firstName: dto.firstName || null,
          lastName: dto.lastName || null,
          contactType: 'lead',
          contactStatus: 'prospecting',
          authMethod: 'magic_link',
          agencyId,
        })
        .returning({ id: this.db.schema.contacts.id })

      contactId = newContact.id
      this.logger.log(`Created new contact ${contactId} for consumer registration`)
    } else {
      contactId = existingContact.id
      portalUserId = existingContact.portalUserId

      if (portalUserId) {
        isExistingUser = true
        this.logger.log(`Existing portal user found for contact ${contactId}, generating new magic link`)
      }
    }

    if (isExistingUser && portalUserId) {
      // 3a. Existing user — just generate a new magic link
      const redirectTo = dto.redirectTo || `${this.portalBaseUrl}/auth/callback`

      const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo,
        },
      })

      if (linkError || !linkData.properties?.hashed_token) {
        this.logger.error(`Failed to generate magic link for existing user: ${linkError?.message}`)
        throw new InternalServerErrorException('Failed to generate magic link')
      }

      const magicLinkUrl = this.buildMagicLinkUrl(linkData.properties.hashed_token, redirectTo)

      return {
        status: 'existing_user',
        contactId,
        message: 'Magic link generated for existing user',
        magicLinkUrl,
      }
    }

    // 3b. New user or contact without portal user — create auth user
    const agencyId = existingContact?.agencyId || await this.getDefaultAgencyId()

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

    if (userError || !userData.user) {
      this.logger.error(`Failed to create auth user: ${userError?.message}`)
      throw new InternalServerErrorException('Failed to create portal account')
    }

    const newUserId = userData.user.id

    // 4. Generate magic link
    const redirectTo = dto.redirectTo || `${this.portalBaseUrl}/auth/callback`

    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo,
      },
    })

    if (linkError || !linkData.properties?.hashed_token) {
      // Rollback: delete auth user
      await this.supabaseAdmin.auth.admin.deleteUser(newUserId)
      this.logger.error(`Failed to generate magic link, rolled back auth user: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to generate magic link')
    }

    // 5. Link portalUserId + portalActivatedAt on contact
    try {
      await this.db.client
        .update(this.db.schema.contacts)
        .set({
          portalUserId: newUserId,
          portalActivatedAt: new Date(),
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

    const magicLinkUrl = this.buildMagicLinkUrl(linkData.properties.hashed_token, redirectTo)

    this.logger.log(`Consumer registered: contact=${contactId}, authUser=${newUserId}`)

    return {
      status: 'new_user',
      contactId,
      message: 'Portal account created and magic link generated',
      magicLinkUrl,
    }
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

  /**
   * Build a magic link URL with the hashed token.
   * Uses the Supabase verify endpoint with PKCE redirect.
   */
  private buildMagicLinkUrl(hashedToken: string, redirectTo: string): string {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')
    return `${supabaseUrl}/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`
  }
}
