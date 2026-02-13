/**
 * Email Domain Filter
 *
 * Filters email recipients based on domain restrictions in non-production environments.
 * Prevents accidental emails to real customers during development/preview.
 */

import { Logger } from '@nestjs/common'

export interface EmailFilterConfig {
  enabled: boolean
  allowedDomains: string[]
  logBlocked: boolean
  environment: 'development' | 'preview' | 'production'
}

export interface EmailFilterResult {
  to: string[]
  cc?: string[]
  bcc?: string[]
  filtered: {
    to: string[]
    cc: string[]
    bcc: string[]
  }
  hasValidRecipients: boolean
  isFiltered: boolean
  environment: string
}

export class EmailDomainFilter {
  private readonly logger = new Logger(EmailDomainFilter.name)
  private config: EmailFilterConfig

  constructor() {
    // Auto-detect environment
    const isDevelopment = process.env.NODE_ENV === 'development'
    const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.RAILWAY_ENVIRONMENT === 'preview'
    const isProduction = process.env.VERCEL_ENV === 'production' ||
                         process.env.RAILWAY_ENVIRONMENT === 'production' ||
                         (!isDevelopment && !isPreview)

    // Parse allowed domains from environment
    const allowedDomainsEnv = process.env.EMAIL_ALLOWED_DOMAINS || 'phoenixvoyages.ca'
    const allowedDomains = allowedDomainsEnv.split(',').map(d => d.trim().toLowerCase())

    // Determine if filtering should be enabled
    const filterEnabled = process.env.EMAIL_DOMAIN_FILTER_ENABLED === 'true' ||
                         (isDevelopment || isPreview) && process.env.EMAIL_DOMAIN_FILTER_ENABLED !== 'false'

    this.config = {
      enabled: !isProduction && filterEnabled, // NEVER filter in production
      allowedDomains,
      logBlocked: process.env.EMAIL_FILTER_LOG_BLOCKED !== 'false',
      environment: isProduction ? 'production' : (isPreview ? 'preview' : 'development')
    }

    // Log initialization
    this.logger.log(`Email Domain Filter initialized: enabled=${this.config.enabled}, environment=${this.config.environment}, allowedDomains=${this.config.allowedDomains.join(', ')}`)
  }

  /**
   * Get current filter configuration
   */
  getConfig(): EmailFilterConfig {
    return { ...this.config }
  }

  /**
   * Check if filtering is currently active
   */
  isFilteringActive(): boolean {
    return this.config.enabled
  }

  /**
   * Check if an email address is allowed
   */
  private isEmailAllowed(email: string): boolean {
    if (!this.config.enabled) return true

    const normalizedEmail = email.toLowerCase().trim()

    // Extract domain from email
    const atIndex = normalizedEmail.lastIndexOf('@')
    if (atIndex === -1) return false

    const domain = normalizedEmail.substring(atIndex + 1)

    // Check if domain is in allowed list
    return this.config.allowedDomains.some(allowedDomain =>
      domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)
    )
  }

  /**
   * Filter a list of email addresses
   */
  private filterEmailList(emails: string | string[] | undefined): { allowed: string[], blocked: string[] } {
    if (!emails) return { allowed: [], blocked: [] }

    const emailArray = Array.isArray(emails) ? emails : [emails]
    const allowed: string[] = []
    const blocked: string[] = []

    for (const email of emailArray) {
      if (this.isEmailAllowed(email)) {
        allowed.push(email)
      } else {
        blocked.push(email)
        if (this.config.logBlocked) {
          this.logger.warn(`Email blocked by domain filter: ${email} (environment: ${this.config.environment})`)
        }
      }
    }

    return { allowed, blocked }
  }

  /**
   * Filter email recipients based on domain restrictions
   */
  filterRecipients(
    to: string | string[],
    cc?: string | string[],
    bcc?: string | string[]
  ): EmailFilterResult {
    // If filtering is not enabled, return original recipients
    if (!this.config.enabled) {
      return {
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
        filtered: { to: [], cc: [], bcc: [] },
        hasValidRecipients: true,
        isFiltered: false,
        environment: this.config.environment
      }
    }

    // Filter each recipient list
    const toResult = this.filterEmailList(to)
    const ccResult = this.filterEmailList(cc)
    const bccResult = this.filterEmailList(bcc)

    // If TO is empty after filtering but CC/BCC has recipients, promote one to TO
    // Resend requires at least one TO recipient
    if (toResult.allowed.length === 0) {
      if (ccResult.allowed.length > 0) {
        // Move first CC to TO
        toResult.allowed.push(ccResult.allowed.shift()!)
        this.logger.log(`Promoted CC recipient to TO after domain filtering (original TO was filtered out)`)
      } else if (bccResult.allowed.length > 0) {
        // Move first BCC to TO
        toResult.allowed.push(bccResult.allowed.shift()!)
        this.logger.log(`Promoted BCC recipient to TO after domain filtering (original TO was filtered out)`)
      }
    }

    // Check if we have any valid recipients
    const hasValidRecipients = toResult.allowed.length > 0 ||
                               ccResult.allowed.length > 0 ||
                               bccResult.allowed.length > 0

    // Log filtering summary
    const totalBlocked = toResult.blocked.length + ccResult.blocked.length + bccResult.blocked.length
    if (totalBlocked > 0) {
      this.logger.log(`Email recipients filtered: ${totalBlocked} blocked, ${toResult.allowed.length} allowed (environment: ${this.config.environment})`)
    }

    return {
      to: toResult.allowed,
      cc: ccResult.allowed.length > 0 ? ccResult.allowed : undefined,
      bcc: bccResult.allowed.length > 0 ? bccResult.allowed : undefined,
      filtered: {
        to: toResult.blocked,
        cc: ccResult.blocked,
        bcc: bccResult.blocked
      },
      hasValidRecipients,
      isFiltered: true,
      environment: this.config.environment
    }
  }

  /**
   * Generate a warning banner for filtered emails
   */
  generateFilterWarningHtml(): string {
    if (!this.config.enabled) return ''

    return `
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 12px; margin-bottom: 20px; border-radius: 6px;">
        <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 14px;">
          EMAIL FILTERING ACTIVE (${this.config.environment.toUpperCase()} MODE)
        </p>
        <p style="margin: 4px 0 0 0; color: #92400e; font-size: 12px;">
          Only emails to @${this.config.allowedDomains.join(', @')} addresses will be sent.
          All other recipients have been filtered out for safety.
        </p>
      </div>
    `
  }

  /**
   * Generate a warning text for filtered emails
   */
  generateFilterWarningText(): string {
    if (!this.config.enabled) return ''

    return `
EMAIL FILTERING ACTIVE (${this.config.environment.toUpperCase()} MODE)
Only emails to @${this.config.allowedDomains.join(', @')} addresses will be sent.
All other recipients have been filtered out for safety.
================================================================================

`
  }

  /**
   * Add environment prefix to subject line
   */
  modifySubject(subject: string): string {
    if (!this.config.enabled) return subject

    const prefix = this.config.environment === 'development' ? '[DEV]' : '[PREVIEW]'
    return `${prefix} ${subject}`
  }
}

// Export singleton instance
let domainFilter: EmailDomainFilter | null = null

export function getEmailDomainFilter(): EmailDomainFilter {
  if (!domainFilter) {
    domainFilter = new EmailDomainFilter()
  }
  return domainFilter
}
