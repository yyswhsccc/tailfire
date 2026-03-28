/**
 * TLN Sync Service
 *
 * Scrapes TravelLeaders Network profile pages and extracts structured data
 * for syncing into advisor profiles.
 *
 * v1: Basic extraction of name, bio, and photo from meta tags.
 * Specialties, certifications, languages, destinations, and reviews
 * can be enhanced in future iterations.
 */

import { Injectable, Logger } from '@nestjs/common'

export interface TlnProfileData {
  displayName?: string
  title?: string
  bio?: string
  photoUrl?: string
  tlnAgentId?: string
  specialties?: string[]
  certifications?: string[]
  languages?: string[]
  destinations?: string[]
  reviews?: unknown[]
}

@Injectable()
export class TlnSyncService {
  private readonly logger = new Logger(TlnSyncService.name)

  /**
   * Extract agent ID from a TLN profile URL.
   * Expected format: https://www.travelleaders.com/agent/388887
   */
  private extractAgentId(profileUrl: string): string | null {
    const match = profileUrl.match(/\/agent\/(\d+)/)
    return match?.[1] ?? null
  }

  /**
   * Scrape a TLN profile page and extract structured data.
   *
   * Uses meta tag extraction (og:title, description) for v1.
   * The TLN photo URL follows a known pattern based on agent ID.
   */
  async syncFromTln(profileUrl: string): Promise<TlnProfileData> {
    const agentId = this.extractAgentId(profileUrl)
    if (!agentId) {
      throw new Error(`Invalid TLN profile URL: ${profileUrl}. Expected format: https://www.travelleaders.com/agent/{id}`)
    }

    this.logger.log(`Syncing TLN profile for agent ${agentId}: ${profileUrl}`)

    try {
      // Fetch the TLN profile page
      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': 'Tailfire/1.0 (Advisor Profile Sync)',
        },
      })

      if (!response.ok) {
        throw new Error(`TLN fetch failed with status ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()

      // Extract from meta tags
      const ogTitle = this.extractMetaContent(html, 'og:title', 'property')
      const description = this.extractMetaContent(html, 'description', 'name')

      // Construct the known photo URL pattern
      const photoUrl = `https://agentprofiler.travelleaders.com/Common/Handlers/img_handler.ashx?type=agt&id=${agentId}`

      // Parse name from og:title (format: "Name : Location Travel Agent | Travel Leaders")
      const displayName = ogTitle?.split(':')[0]?.trim() ?? undefined

      // Parse title from og:title (format: "Name : Location Travel Agent | Travel Leaders")
      const titlePart = ogTitle?.split(':')[1]?.split('|')[0]?.trim() ?? undefined

      // Extract specialties from description (commonly: "specializing in X, Y, and Z")
      const specialties = this.extractSpecialties(description)

      this.logger.log(`TLN sync complete for agent ${agentId}: name="${displayName}", specialties=${specialties?.length ?? 0}`)

      return {
        displayName,
        title: titlePart,
        bio: description ?? undefined,
        photoUrl,
        tlnAgentId: agentId,
        specialties,
        // These can be enhanced in v2 with deeper HTML parsing
        certifications: undefined,
        languages: undefined,
        destinations: undefined,
        reviews: undefined,
      }
    } catch (error) {
      this.logger.error(`TLN sync failed for ${profileUrl}: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /**
   * Extract content attribute from a meta tag.
   */
  private extractMetaContent(
    html: string,
    name: string,
    attributeType: 'property' | 'name',
  ): string | null {
    // Match both attribute orderings: (property/name before content) and (content before property/name)
    const pattern1 = new RegExp(
      `<meta\\s+${attributeType}="${name}"\\s+content="([^"]*)"`,
      'i',
    )
    const pattern2 = new RegExp(
      `<meta\\s+content="([^"]*)"\\s+${attributeType}="${name}"`,
      'i',
    )

    return pattern1.exec(html)?.[1] ?? pattern2.exec(html)?.[1] ?? null
  }

  /**
   * Extract specialties from the description meta tag.
   * Common format: "specializing in X, Y, as well as Z"
   */
  private extractSpecialties(description: string | null): string[] | undefined {
    if (!description) return undefined

    const match = description.match(/specializing in\s+(.+?)(?:\.|$)/i)
    if (!match?.[1]) return undefined

    // Split by common separators: comma, "and", "as well as"
    const raw = match[1]
      .replace(/\s+as well as\s+/gi, ', ')
      .replace(/\s+and\s+/gi, ', ')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    return raw.length > 0 ? raw : undefined
  }
}
