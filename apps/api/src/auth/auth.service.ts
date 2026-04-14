import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { EmailService } from '../email/email.service'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly supabaseAdmin: SupabaseClient

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly db: DatabaseService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }

    this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async requestPasswordReset(email: string): Promise<void> {
    const adminUrl = this.configService.get<string>('ADMIN_URL') || 'http://localhost:3100'

    try {
      // Use Supabase Admin API to generate recovery link
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${adminUrl}/auth/callback`,
        },
      })

      if (error) {
        // Log error but don't expose to client (prevents email enumeration)
        this.logger.warn(`Password reset link generation failed for ${email}: ${error.message}`)
        return
      }

      if (!data.properties?.hashed_token) {
        this.logger.warn(`Password reset: no hashed_token generated for ${email}`)
        return
      }

      // Build direct callback link with hashed_token (same pattern as invites)
      const resetLink = `${adminUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery`

      // Look up user's agency ID from their profile for email logging
      const { userProfiles } = this.db.schema
      const profile = await this.db.client.query.userProfiles.findFirst({
        where: eq(userProfiles.email, email),
        columns: { agencyId: true },
      })

      const agencyId = profile?.agencyId
      if (!agencyId) {
        // No profile found — don't reveal this to the client, but log it
        this.logger.warn(`Password reset: no user profile found for ${email}`)
        return
      }

      // Send email with reset link
      await this.emailService.sendPasswordResetEmail(email, resetLink, agencyId)
      this.logger.log(`Password reset email sent to ${email}`)
    } catch (error) {
      // Log error but don't expose to client
      this.logger.error(`Password reset error for ${email}: ${error}`)
    }
  }
}
