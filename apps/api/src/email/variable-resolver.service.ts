/**
 * Variable Resolver Service
 *
 * Resolves template variables from database context.
 * Supports {{variable}} and {{variable::fallback}} syntax.
 */

import { Injectable, Logger } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

export interface ResolverContext {
  agencyId?: string
  tripId?: string
  contactId?: string
  activityId?: string
  agentId?: string
  paymentItemId?: string
}

interface CacheEntry {
  data: string
  timestamp: number
}

@Injectable()
export class VariableResolverService {
  private readonly logger = new Logger(VariableResolverService.name)
  private readonly cache = new Map<string, CacheEntry>()
  private readonly cacheTTL = 5 * 60 * 1000 // 5 minutes

  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve all variables in a text string
   * Supports both {{variable}} and {{variable::fallback}} syntax
   */
  async resolveText(
    text: string,
    context: ResolverContext,
    additionalVariables?: Record<string, string>
  ): Promise<string> {
    if (!text) return ''

    // Find all variables in the text
    const variablePattern = /\{\{([^}]+)\}\}/g
    const matches = Array.from(text.matchAll(variablePattern))

    if (matches.length === 0) return text

    // Collect unique variable keys
    const uniqueVariables = Array.from(new Set(matches.map(m => m[1]).filter((v): v is string => v !== undefined)))

    // Resolve all variables concurrently
    const resolutions = await Promise.all(
      uniqueVariables.map(async (variable) => {
        const value = await this.resolveVariable(variable, context, additionalVariables)
        return { variable, value }
      })
    )

    // Build resolution map
    const resolvedVariables = new Map<string, string>()
    resolutions.forEach(({ variable, value }) => {
      resolvedVariables.set(variable, value)
    })

    // Replace variables in text
    let resolvedText = text
    resolvedVariables.forEach((value, variable) => {
      const regex = new RegExp(`\\{\\{${this.escapeRegex(variable)}\\}\\}`, 'g')
      resolvedText = resolvedText.replace(regex, value)
    })

    return resolvedText
  }

  /**
   * Resolve a single variable
   */
  async resolveVariable(
    variableKey: string,
    context: ResolverContext,
    additionalVariables?: Record<string, string>
  ): Promise<string> {
    // Parse variable and fallback
    const [key, fallback] = this.parseVariableWithFallback(variableKey)

    // Check additional variables first (custom overrides)
    if (additionalVariables?.[key]) {
      return additionalVariables[key]
    }

    // Check cache
    const cacheKey = this.getCacheKey(key, context)
    const cached = this.getFromCache(cacheKey)
    if (cached !== null) {
      return cached
    }

    try {
      // Resolve from database based on variable type
      const value = await this.fetchVariableValue(key, context)

      if (value) {
        this.setCache(cacheKey, value)
        return value
      }

      // Return fallback or empty placeholder
      return fallback || ''
    } catch (error) {
      this.logger.warn(`Failed to resolve variable ${key}: ${error}`)
      return fallback || ''
    }
  }

  /**
   * Fetch variable value from database
   */
  private async fetchVariableValue(key: string, context: ResolverContext): Promise<string | null> {
    const [category, field] = key.split('.')
    if (!category || !field) return null

    switch (category) {
      case 'contact':
        return this.resolveContactVariable(field, context)
      case 'trip':
        return this.resolveTripVariable(field, context)
      case 'activity':
        return this.resolveActivityVariable(field, context)
      case 'agent':
        return this.resolveAgentVariable(field, context)
      case 'business':
        return this.resolveBusinessVariable(field, context)
      case 'payment':
        return this.resolvePaymentVariable(field, context)
      default:
        this.logger.debug(`Unknown variable category: ${category}`)
        return null
    }
  }

  /**
   * Resolve contact-related variables
   */
  private async resolveContactVariable(field: string, context: ResolverContext): Promise<string | null> {
    if (!context.contactId && !context.tripId) return null

    const { contacts, trips } = this.db.schema
    let contactId = context.contactId

    // If no contactId but have tripId, get primary contact from trip
    if (!contactId && context.tripId) {
      const [trip] = await this.db.client
        .select({ primaryContactId: trips.primaryContactId })
        .from(trips)
        .where(eq(trips.id, context.tripId))
        .limit(1)

      contactId = trip?.primaryContactId || undefined
    }

    if (!contactId) return null

    const [contact] = await this.db.client
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)

    if (!contact) return null

    return this.extractField(contact, field)
  }

  /**
   * Resolve trip-related variables
   */
  private async resolveTripVariable(field: string, context: ResolverContext): Promise<string | null> {
    if (!context.tripId) return null

    const { trips } = this.db.schema

    const [trip] = await this.db.client
      .select()
      .from(trips)
      .where(eq(trips.id, context.tripId))
      .limit(1)

    if (!trip) return null

    // Handle special fields
    if (field === 'start_date' || field === 'end_date') {
      const dateValue = trip[field === 'start_date' ? 'startDate' : 'endDate']
      return dateValue ? this.formatDate(dateValue) : null
    }

    return this.extractField(trip, field)
  }

  /**
   * Resolve activity-related variables
   */
  private async resolveActivityVariable(field: string, context: ResolverContext): Promise<string | null> {
    if (!context.activityId) return null

    const { itineraryActivities } = this.db.schema

    const [activity] = await this.db.client
      .select()
      .from(itineraryActivities)
      .where(eq(itineraryActivities.id, context.activityId))
      .limit(1)

    if (!activity) return null

    // Handle special fields - use the actual schema fields
    if (field === 'date') {
      // Activities may not have a direct date field - they're associated with itinerary days
      // Try to get from activity fields or return null
      return null
    }
    if (field === 'price') {
      // Price is on activity_pricing table, not directly on activities
      return null
    }

    return this.extractField(activity, field)
  }

  /**
   * Resolve agent-related variables
   */
  private async resolveAgentVariable(field: string, context: ResolverContext): Promise<string | null> {
    let agentId = context.agentId

    // If no agentId but have tripId, get owner (agent) from trip
    if (!agentId && context.tripId) {
      const { trips } = this.db.schema
      const [trip] = await this.db.client
        .select({ ownerId: trips.ownerId })
        .from(trips)
        .where(eq(trips.id, context.tripId))
        .limit(1)

      agentId = trip?.ownerId || undefined
    }

    if (!agentId) return null

    const { userProfiles } = this.db.schema

    const [agent] = await this.db.client
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, agentId))
      .limit(1)

    if (!agent) return null

    // Handle full_name
    if (field === 'full_name') {
      return [agent.firstName, agent.lastName].filter(Boolean).join(' ') || null
    }

    return this.extractField(agent, field)
  }

  /**
   * Resolve business-related variables
   */
  private async resolveBusinessVariable(field: string, context: ResolverContext): Promise<string | null> {
    if (!context.agencyId) return null

    const { agencies } = this.db.schema

    const [agency] = await this.db.client
      .select()
      .from(agencies)
      .where(eq(agencies.id, context.agencyId))
      .limit(1)

    if (!agency) return null

    return this.extractField(agency, field)
  }

  /**
   * Resolve payment-related variables
   */
  private async resolvePaymentVariable(field: string, context: ResolverContext): Promise<string | null> {
    if (!context.paymentItemId) return null

    const { expectedPaymentItems } = this.db.schema

    const [paymentItem] = await this.db.client
      .select()
      .from(expectedPaymentItems)
      .where(eq(expectedPaymentItems.id, context.paymentItemId))
      .limit(1)

    if (!paymentItem) return null

    // Handle special fields
    switch (field) {
      case 'amount':
        return paymentItem.expectedAmountCents
          ? this.formatCurrency(paymentItem.expectedAmountCents)
          : null
      case 'paid_amount':
        return paymentItem.paidAmountCents
          ? this.formatCurrency(paymentItem.paidAmountCents)
          : null
      case 'remaining':
        if (paymentItem.expectedAmountCents && paymentItem.paidAmountCents !== null) {
          const remaining = paymentItem.expectedAmountCents - (paymentItem.paidAmountCents || 0)
          return this.formatCurrency(remaining)
        }
        return paymentItem.expectedAmountCents ? this.formatCurrency(paymentItem.expectedAmountCents) : null
      case 'due_date':
        return paymentItem.dueDate ? this.formatDate(paymentItem.dueDate) : null
      default:
        return this.extractField(paymentItem, field)
    }
  }

  /**
   * Format currency amount from cents
   */
  private formatCurrency(cents: number): string {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'CAD',
    })
  }

  /**
   * Extract field value from object (handles snake_case to camelCase)
   */
  private extractField(obj: Record<string, any>, field: string): string | null {
    // Try direct field name first
    if (obj[field] !== undefined && obj[field] !== null) {
      return String(obj[field])
    }

    // Try camelCase version
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    if (obj[camelField] !== undefined && obj[camelField] !== null) {
      return String(obj[camelField])
    }

    return null
  }

  /**
   * Parse variable with fallback syntax
   */
  private parseVariableWithFallback(variable: string): [string, string | undefined] {
    const parts = variable.split('::')
    const key = parts[0]?.trim() ?? variable
    const fallback = parts[1]?.trim()
    return [key, fallback]
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // formatCurrency removed - price resolution requires joining with activity_pricing table

  /**
   * Generate cache key
   */
  private getCacheKey(variable: string, context: ResolverContext): string {
    const contextKeys = Object.entries(context)
      .filter(([_, value]) => value != null)
      .map(([key, value]) => `${key}:${value}`)
      .join('|')
    return `${variable}|${contextKeys}`
  }

  /**
   * Get value from cache
   */
  private getFromCache(key: string): string | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * Set value in cache
   */
  private setCache(key: string, value: string): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
    })

    // Cleanup if cache is large
    if (this.cache.size > 1000) {
      const now = Date.now()
      for (const [cacheKey, cached] of Array.from(this.cache.entries())) {
        if (now - cached.timestamp > this.cacheTTL) {
          this.cache.delete(cacheKey)
        }
      }
    }
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get list of available variables for documentation
   */
  getAvailableVariables(): Array<{ key: string; description: string; category: string }> {
    return [
      // Contact variables
      { key: 'contact.first_name', description: "Contact's first name", category: 'Contact' },
      { key: 'contact.last_name', description: "Contact's last name", category: 'Contact' },
      { key: 'contact.email', description: "Contact's email address", category: 'Contact' },
      { key: 'contact.phone', description: "Contact's phone number", category: 'Contact' },
      // Trip variables
      { key: 'trip.name', description: 'Trip name', category: 'Trip' },
      { key: 'trip.reference', description: 'Trip reference number', category: 'Trip' },
      { key: 'trip.start_date', description: 'Trip start date', category: 'Trip' },
      { key: 'trip.end_date', description: 'Trip end date', category: 'Trip' },
      { key: 'trip.destination', description: 'Trip destination', category: 'Trip' },
      // Activity variables
      { key: 'activity.name', description: 'Activity name', category: 'Activity' },
      { key: 'activity.date', description: 'Activity date', category: 'Activity' },
      { key: 'activity.price', description: 'Activity price', category: 'Activity' },
      { key: 'activity.description', description: 'Activity description', category: 'Activity' },
      // Agent variables
      { key: 'agent.first_name', description: "Agent's first name", category: 'Agent' },
      { key: 'agent.last_name', description: "Agent's last name", category: 'Agent' },
      { key: 'agent.full_name', description: "Agent's full name", category: 'Agent' },
      { key: 'agent.email', description: "Agent's email", category: 'Agent' },
      { key: 'agent.phone', description: "Agent's phone number", category: 'Agent' },
      // Business variables
      { key: 'business.name', description: 'Agency name', category: 'Business' },
      { key: 'business.phone', description: 'Agency phone number', category: 'Business' },
      { key: 'business.email', description: 'Agency email address', category: 'Business' },
      // Payment variables
      { key: 'payment.name', description: 'Payment item name', category: 'Payment' },
      { key: 'payment.amount', description: 'Total payment amount', category: 'Payment' },
      { key: 'payment.paid_amount', description: 'Amount already paid', category: 'Payment' },
      { key: 'payment.remaining', description: 'Remaining balance due', category: 'Payment' },
      { key: 'payment.due_date', description: 'Payment due date', category: 'Payment' },
      { key: 'payment.status', description: 'Payment status', category: 'Payment' },
    ]
  }
}
