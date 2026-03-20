/**
 * Stripe Connect Service
 *
 * Manages Stripe Connect functionality for agencies:
 * - Account creation and onboarding
 * - Account status monitoring
 * - Customer management (per connected account)
 */

import { Injectable, BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import * as Sentry from '@sentry/nestjs'
import Stripe from 'stripe'
import { DatabaseService } from '../db/database.service'
import type {
  StripeOnboardingResponseDto,
  StripeAccountStatusResponseDto,
  AgencySettingsResponseDto,
  StripeAccountStatus,
} from '@tailfire/shared-types'

@Injectable()
export class StripeConnectService {
  private stripe: Stripe | null = null

  constructor(private readonly db: DatabaseService) {
    // Initialize Stripe with the platform's secret key (optional)
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-12-15.clover',
      })
    } else {
      console.warn('STRIPE_SECRET_KEY not configured. Stripe features will be disabled.')
      Sentry.captureMessage('STRIPE_SECRET_KEY not configured', 'warning')
    }
  }

  /**
   * Check if Stripe is configured and available
   */
  private ensureStripeConfigured(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured')
    }
    return this.stripe
  }

  /**
   * Get or create agency settings record
   */
  async getAgencySettings(agencyId: string): Promise<AgencySettingsResponseDto> {
    let [settings] = await this.db.client
      .select()
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    // Create if doesn't exist
    if (!settings) {
      const [created] = await this.db.client
        .insert(this.db.schema.agencySettings)
        .values({
          agencyId,
          stripeAccountStatus: 'not_connected',
        })
        .returning()
      settings = created!
    }

    return this.formatAgencySettings(settings)
  }

  /**
   * Start Stripe Connect onboarding for an agency
   * Creates a Connect account and returns the onboarding URL
   */
  async startOnboarding(
    agencyId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<StripeOnboardingResponseDto> {
    const stripe = this.ensureStripeConfigured()

    // Get current settings
    const settings = await this.getAgencySettings(agencyId)

    let accountId = settings.stripeAccountId

    // Create account if it doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          agencyId,
        },
      })

      accountId = account.id

      // Update agency settings with account ID
      await this.db.client
        .update(this.db.schema.agencySettings)
        .set({
          stripeAccountId: accountId,
          stripeAccountStatus: 'pending',
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
    }

    // Generate onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    })

    return {
      onboardingUrl: accountLink.url,
      expiresAt: new Date(accountLink.expires_at * 1000).toISOString(),
    }
  }

  /**
   * Check and update the status of a Stripe Connect account
   */
  async refreshAccountStatus(agencyId: string): Promise<StripeAccountStatusResponseDto> {
    const stripe = this.ensureStripeConfigured()

    const [settings] = await this.db.client
      .select()
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    if (!settings?.stripeAccountId) {
      return {
        status: 'not_connected',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirements: [],
      }
    }

    // Fetch account from Stripe
    const account = await stripe.accounts.retrieve(settings.stripeAccountId)

    // Determine status based on account state
    let status: StripeAccountStatus = 'pending'
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active'
    } else if (account.requirements?.disabled_reason) {
      status = 'disabled'
    } else if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
      status = 'restricted'
    }

    // Update database
    await this.db.client
      .update(this.db.schema.agencySettings)
      .set({
        stripeAccountStatus: status,
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
        stripeOnboardingCompletedAt:
          account.details_submitted && !settings.stripeOnboardingCompletedAt
            ? new Date()
            : settings.stripeOnboardingCompletedAt,
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))

    return {
      status,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      requirements: account.requirements?.currently_due ?? [],
    }
  }

  /**
   * Create a login link for the Stripe Express Dashboard
   */
  async createDashboardLink(agencyId: string): Promise<{ url: string }> {
    const stripe = this.ensureStripeConfigured()

    const [settings] = await this.db.client
      .select()
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    if (!settings?.stripeAccountId) {
      throw new BadRequestException('Stripe account not connected')
    }

    const loginLink = await stripe.accounts.createLoginLink(settings.stripeAccountId)

    return { url: loginLink.url }
  }

  /**
   * Get or create a Stripe customer for a contact on a connected account
   */
  async getOrCreateCustomer(
    contactId: string,
    stripeAccountId: string,
    contactEmail: string,
    contactName: string
  ): Promise<string> {
    const stripe = this.ensureStripeConfigured()

    // Check if customer exists
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.contactStripeCustomers)
      .where(
        eq(this.db.schema.contactStripeCustomers.contactId, contactId)
      )
      .limit(1)

    if (existing && existing.stripeAccountId === stripeAccountId) {
      return existing.stripeCustomerId
    }

    // Create customer on connected account
    const customer = await stripe.customers.create(
      {
        email: contactEmail,
        name: contactName,
        metadata: {
          contactId,
        },
      },
      {
        stripeAccount: stripeAccountId,
      }
    )

    // Store the customer ID
    await this.db.client.insert(this.db.schema.contactStripeCustomers).values({
      contactId,
      stripeAccountId,
      stripeCustomerId: customer.id,
    })

    return customer.id
  }

  /**
   * Update agency settings (non-Stripe fields)
   */
  async updateAgencySettings(
    agencyId: string,
    updates: {
      jurisdictionCode?: string
      complianceDisclaimerText?: string
      insuranceWaiverText?: string
      logoUrl?: string
      primaryColor?: string
      commissionFeeRate?: number
      emailAllowedDomains?: string[]
      emailComplianceFooter?: string | null
    }
  ): Promise<AgencySettingsResponseDto> {
    // Validate commission fee rate range
    if (updates.commissionFeeRate !== undefined) {
      if (updates.commissionFeeRate < 0 || updates.commissionFeeRate > 100) {
        throw new BadRequestException('commissionFeeRate must be between 0 and 100')
      }
    }
    // Ensure settings exist
    await this.getAgencySettings(agencyId)

    // Build update payload, converting numeric commissionFeeRate to string for decimal column
    const { commissionFeeRate, ...restUpdates } = updates
    const updatePayload: Record<string, unknown> = {
      ...restUpdates,
      updatedAt: new Date(),
    }
    if (commissionFeeRate !== undefined) {
      updatePayload.commissionFeeRate = commissionFeeRate.toString()
    }

    const [updated] = await this.db.client
      .update(this.db.schema.agencySettings)
      .set(updatePayload)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .returning()

    return this.formatAgencySettings(updated!)
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private formatAgencySettings(settings: {
    id: string
    agencyId: string
    stripeAccountId: string | null
    stripeAccountStatus: StripeAccountStatus
    stripeChargesEnabled: boolean | null
    stripePayoutsEnabled: boolean | null
    stripeOnboardingCompletedAt: Date | null
    jurisdictionCode: string | null
    complianceDisclaimerText: string | null
    insuranceWaiverText: string | null
    commissionFeeRate: string
    logoUrl: string | null
    primaryColor: string | null
    emailAllowedDomains: unknown
    emailComplianceFooter: string | null
    createdAt: Date
    updatedAt: Date
  }): AgencySettingsResponseDto {
    return {
      id: settings.id,
      agencyId: settings.agencyId,
      stripeAccountId: settings.stripeAccountId,
      stripeAccountStatus: settings.stripeAccountStatus,
      stripeChargesEnabled: settings.stripeChargesEnabled ?? false,
      stripePayoutsEnabled: settings.stripePayoutsEnabled ?? false,
      stripeOnboardingCompletedAt: settings.stripeOnboardingCompletedAt?.toISOString() ?? null,
      jurisdictionCode: settings.jurisdictionCode,
      complianceDisclaimerText: settings.complianceDisclaimerText,
      insuranceWaiverText: settings.insuranceWaiverText,
      commissionFeeRate: settings.commissionFeeRate,
      logoUrl: settings.logoUrl,
      primaryColor: settings.primaryColor,
      emailAllowedDomains: (settings.emailAllowedDomains as string[]) ?? [],
      emailComplianceFooter: settings.emailComplianceFooter,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    }
  }
}
