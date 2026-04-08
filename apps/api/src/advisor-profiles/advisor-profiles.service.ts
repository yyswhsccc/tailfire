/**
 * Advisor Profiles Service
 *
 * Business logic for advisor profile CRUD, featured deals, and TLN sync.
 * Supports public listing (OTA) and admin management.
 */

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { eq, and, sql, desc, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { OtaRevalidationService } from '../common/services/ota-revalidation.service'
import { TlnSyncService } from './tln-sync.service'
import type { CreateAdvisorProfileDto } from './dto/create-advisor-profile.dto'
import type { UpdateAdvisorProfileDto } from './dto/update-advisor-profile.dto'
import type { schema } from '@tailfire/database'

type AdvisorProfile = typeof schema.advisorProfiles.$inferSelect
type Deal = typeof schema.deals.$inferSelect
type OtaPublishedTrip = typeof schema.otaPublishedTrips.$inferSelect

@Injectable()
export class AdvisorProfilesService {
  private readonly logger = new Logger(AdvisorProfilesService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly otaRevalidation: OtaRevalidationService,
    private readonly tlnSyncService: TlnSyncService,
  ) {}

  // ============================================================================
  // PUBLIC — List published advisor profiles with optional filters
  // ============================================================================

  async findPublished(
    filters?: { specialty?: string; language?: string; destination?: string },
  ): Promise<AdvisorProfile[]> {
    const { advisorProfiles } = this.db.schema

    // Build WHERE conditions — always filter to published only
    const conditions: any[] = [eq(advisorProfiles.isPublished, true)]

    if (filters?.specialty) {
      // Match advisors who have this specialty in their specialties array
      conditions.push(
        sql`${advisorProfiles.specialties} @> ARRAY[${filters.specialty}]::text[]`,
      )
    }

    if (filters?.language) {
      conditions.push(
        sql`${advisorProfiles.languages} @> ARRAY[${filters.language}]::text[]`,
      )
    }

    if (filters?.destination) {
      conditions.push(
        sql`${advisorProfiles.destinations} @> ARRAY[${filters.destination}]::text[]`,
      )
    }

    const rows = await this.db.client
      .select()
      .from(advisorProfiles)
      .where(and(...conditions))
      .orderBy(desc(advisorProfiles.createdAt))

    return rows
  }

  // ============================================================================
  // PUBLIC — Single advisor profile by slug
  // ============================================================================

  async findBySlug(slug: string): Promise<AdvisorProfile | null> {
    const { advisorProfiles } = this.db.schema

    const [profile] = await this.db.client
      .select()
      .from(advisorProfiles)
      .where(and(eq(advisorProfiles.slug, slug), eq(advisorProfiles.isPublished, true)))
      .limit(1)

    return profile ?? null
  }

  // ============================================================================
  // PUBLIC — Advisor's featured deals (join advisor_featured_deals + deals)
  // ============================================================================

  async getAdvisorDeals(slug: string): Promise<Deal[]> {
    const { advisorProfiles, advisorFeaturedDeals, deals } = this.db.schema

    // First resolve the advisor profile by slug
    const [profile] = await this.db.client
      .select({ id: advisorProfiles.id })
      .from(advisorProfiles)
      .where(and(eq(advisorProfiles.slug, slug), eq(advisorProfiles.isPublished, true)))
      .limit(1)

    if (!profile) {
      return []
    }

    // Join advisor_featured_deals to deals, ordered by sortOrder
    const rows = await this.db.client
      .select({
        deal: deals,
        sortOrder: advisorFeaturedDeals.sortOrder,
      })
      .from(advisorFeaturedDeals)
      .innerJoin(deals, eq(advisorFeaturedDeals.dealId, deals.id))
      .where(
        and(
          eq(advisorFeaturedDeals.advisorProfileId, profile.id),
          eq(deals.isPublished, true),
        ),
      )
      .orderBy(asc(advisorFeaturedDeals.sortOrder))

    return rows.map((r) => r.deal)
  }

  // ============================================================================
  // PUBLIC — Advisor's published trips
  // ============================================================================

  async getAdvisorTrips(slug: string): Promise<OtaPublishedTrip[]> {
    const { advisorProfiles, otaPublishedTrips } = this.db.schema

    // First resolve the advisor profile by slug
    const [profile] = await this.db.client
      .select({ id: advisorProfiles.id })
      .from(advisorProfiles)
      .where(and(eq(advisorProfiles.slug, slug), eq(advisorProfiles.isPublished, true)))
      .limit(1)

    if (!profile) {
      return []
    }

    const rows = await this.db.client
      .select()
      .from(otaPublishedTrips)
      .where(
        and(
          eq(otaPublishedTrips.advisorProfileId, profile.id),
          eq(otaPublishedTrips.isPublished, true),
        ),
      )
      .orderBy(desc(otaPublishedTrips.createdAt))

    return rows
  }

  // ============================================================================
  // ADMIN — Get advisor profile for the current authenticated user
  // ============================================================================

  async findByUserId(userId: string): Promise<AdvisorProfile | null> {
    const { advisorProfiles } = this.db.schema

    const [profile] = await this.db.client
      .select()
      .from(advisorProfiles)
      .where(eq(advisorProfiles.userId, userId))
      .limit(1)

    return profile ?? null
  }

  // ============================================================================
  // ADMIN — Create an advisor profile
  // ============================================================================

  async create(
    dto: CreateAdvisorProfileDto,
    userId: string,
    agencyId: string,
  ): Promise<AdvisorProfile> {
    const { advisorProfiles } = this.db.schema

    const [profile] = await this.db.client
      .insert(advisorProfiles)
      .values({
        userId,
        agencyId,
        slug: dto.slug,
        tlnProfileUrl: dto.tlnProfileUrl,
        displayName: dto.displayName,
        title: dto.title,
        bio: dto.bio,
        photoUrl: dto.photoUrl,
        bioSupplement: dto.bioSupplement,
        socialLinks: dto.socialLinks ?? {},
        isPublished: dto.isPublished ?? false,
      })
      .returning()

    this.logger.log(`Advisor profile created: ${profile!.id} (slug=${profile!.slug})`)
    return profile!
  }

  // ============================================================================
  // ADMIN — Update an advisor profile
  // ============================================================================

  async update(id: string, dto: UpdateAdvisorProfileDto, agencyId: string): Promise<AdvisorProfile> {
    const { advisorProfiles } = this.db.schema

    // Build update values — only include defined fields
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (dto.slug !== undefined) updateValues.slug = dto.slug
    if (dto.tlnProfileUrl !== undefined) updateValues.tlnProfileUrl = dto.tlnProfileUrl
    if (dto.displayName !== undefined) updateValues.displayName = dto.displayName
    if (dto.title !== undefined) updateValues.title = dto.title
    if (dto.bio !== undefined) updateValues.bio = dto.bio
    if (dto.photoUrl !== undefined) updateValues.photoUrl = dto.photoUrl
    if (dto.bioSupplement !== undefined) updateValues.bioSupplement = dto.bioSupplement
    if (dto.socialLinks !== undefined) updateValues.socialLinks = dto.socialLinks
    if (dto.isPublished !== undefined) updateValues.isPublished = dto.isPublished

    const [profile] = await this.db.client
      .update(advisorProfiles)
      .set(updateValues)
      .where(and(eq(advisorProfiles.id, id), eq(advisorProfiles.agencyId, agencyId)))
      .returning()

    if (!profile) {
      throw new NotFoundException(`Advisor profile ${id} not found`)
    }

    this.logger.log(`Advisor profile updated: ${profile.id} (slug=${profile.slug})`)

    // Invalidate OTA ISR cache — listing and specific advisor page
    this.otaRevalidation.revalidateTag('advisors')
    if (profile.slug) {
      this.otaRevalidation.revalidatePath(`/advisors/${profile.slug}`)
    }

    return profile
  }

  // ============================================================================
  // ADMIN — Delete an advisor profile (hard delete)
  // ============================================================================

  async delete(id: string, agencyId: string): Promise<void> {
    const { advisorProfiles } = this.db.schema

    const [deleted] = await this.db.client
      .delete(advisorProfiles)
      .where(and(eq(advisorProfiles.id, id), eq(advisorProfiles.agencyId, agencyId)))
      .returning({ id: advisorProfiles.id })

    if (!deleted) {
      throw new NotFoundException(`Advisor profile ${id} not found`)
    }

    this.logger.log(`Advisor profile deleted: ${id}`)
  }

  // ============================================================================
  // ADMIN — Set featured deals for an advisor
  // ============================================================================

  async setFeaturedDeals(
    id: string,
    dealEntries: { dealId: string; sortOrder: number }[],
  ): Promise<void> {
    const { advisorProfiles, advisorFeaturedDeals } = this.db.schema

    // Verify profile exists (include slug for ISR revalidation path)
    const [profile] = await this.db.client
      .select({ id: advisorProfiles.id, slug: advisorProfiles.slug })
      .from(advisorProfiles)
      .where(eq(advisorProfiles.id, id))
      .limit(1)

    if (!profile) {
      throw new NotFoundException(`Advisor profile ${id} not found`)
    }

    // Replace all featured deals in a transaction:
    // 1. Delete existing entries for this advisor
    // 2. Insert new entries
    await this.db.client.transaction(async (tx) => {
      await tx
        .delete(advisorFeaturedDeals)
        .where(eq(advisorFeaturedDeals.advisorProfileId, id))

      if (dealEntries.length > 0) {
        await tx.insert(advisorFeaturedDeals).values(
          dealEntries.map((entry) => ({
            advisorProfileId: id,
            dealId: entry.dealId,
            sortOrder: entry.sortOrder,
          })),
        )
      }
    })

    this.logger.log(
      `Featured deals updated for advisor ${id}: ${dealEntries.length} deals`,
    )

    // Invalidate OTA ISR cache for this advisor's deals page
    if (profile.slug) {
      this.otaRevalidation.revalidatePath(`/advisors/${profile.slug}`)
    }
  }

  // ============================================================================
  // ADMIN — Trigger TLN profile sync
  // ============================================================================

  async triggerTlnSync(id: string): Promise<AdvisorProfile> {
    const { advisorProfiles } = this.db.schema

    // Get the profile with its TLN URL
    const [profile] = await this.db.client
      .select()
      .from(advisorProfiles)
      .where(eq(advisorProfiles.id, id))
      .limit(1)

    if (!profile) {
      throw new NotFoundException(`Advisor profile ${id} not found`)
    }

    if (!profile.tlnProfileUrl) {
      throw new NotFoundException(
        `Advisor profile ${id} has no TLN profile URL configured`,
      )
    }

    // Scrape the TLN profile
    const tlnData = await this.tlnSyncService.syncFromTln(profile.tlnProfileUrl)

    // Update the synced fields
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
      tlnLastSyncedAt: new Date(),
      tlnAgentId: tlnData.tlnAgentId,
    }

    // Only overwrite synced fields if TLN returned data
    if (tlnData.displayName) updateValues.displayName = tlnData.displayName
    if (tlnData.title) updateValues.title = tlnData.title
    if (tlnData.bio) updateValues.bio = tlnData.bio
    if (tlnData.photoUrl) updateValues.photoUrl = tlnData.photoUrl
    if (tlnData.specialties) updateValues.specialties = tlnData.specialties
    if (tlnData.certifications) updateValues.certifications = tlnData.certifications
    if (tlnData.languages) updateValues.languages = tlnData.languages
    if (tlnData.destinations) updateValues.destinations = tlnData.destinations
    if (tlnData.reviews) updateValues.reviews = tlnData.reviews

    const [updated] = await this.db.client
      .update(advisorProfiles)
      .set(updateValues)
      .where(eq(advisorProfiles.id, id))
      .returning()

    this.logger.log(`TLN sync complete for advisor ${id} (agent=${tlnData.tlnAgentId})`)

    // Invalidate OTA ISR cache — TLN sync may have changed bio, photo, specialties
    this.otaRevalidation.revalidateTag('advisors')

    return updated!
  }

  // ============================================================================
  // ADMIN — Sync advisor profiles from user_profiles (batch create)
  // ============================================================================

  async syncFromUserProfiles(): Promise<{
    created: number
    skipped: number
    errors: { userId: string; error: string }[]
  }> {
    const { advisorProfiles, userProfiles } = this.db.schema

    // 1. Get all active user profiles
    const activeUsers = await this.db.client
      .select({
        id: userProfiles.id,
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
        bio: userProfiles.bio,
        avatarUrl: userProfiles.avatarUrl,
        agencyId: userProfiles.agencyId,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.isActive, true),
          eq(userProfiles.status, 'active'),
        ),
      )

    // 2. Get all existing advisor profile userIds to skip
    const existingProfiles = await this.db.client
      .select({ userId: advisorProfiles.userId })
      .from(advisorProfiles)

    const existingUserIds = new Set(existingProfiles.map((p) => p.userId))

    // 3. Filter to users who don't already have an advisor profile
    const usersToCreate = activeUsers.filter((u) => !existingUserIds.has(u.id))

    if (usersToCreate.length === 0) {
      this.logger.log('Advisor profile sync: all users already have profiles')
      return { created: 0, skipped: activeUsers.length, errors: [] }
    }

    // 4. Get all existing slugs to handle duplicates
    const existingSlugs = await this.db.client
      .select({ slug: advisorProfiles.slug })
      .from(advisorProfiles)

    const slugSet = new Set(existingSlugs.map((s) => s.slug))

    // 5. Create profiles one by one (to handle slug uniqueness gracefully)
    let created = 0
    const errors: { userId: string; error: string }[] = []

    for (const user of usersToCreate) {
      try {
        const baseSlug = this.generateSlug(user.firstName, user.lastName)
        const slug = this.deduplicateSlug(baseSlug, slugSet)
        slugSet.add(slug) // Track for subsequent iterations

        await this.db.client.insert(advisorProfiles).values({
          userId: user.id,
          agencyId: user.agencyId,
          slug,
          displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Travel Advisor',
          title: 'Travel Advisor',
          bio: user.bio ?? null,
          photoUrl: user.avatarUrl ?? null,
          specialties: [],
          languages: [],
          destinations: [],
          isPublished: true,
        })

        created++
        this.logger.log(`Advisor profile created for user ${user.id} (slug=${slug})`)
      } catch (err: any) {
        this.logger.error(`Failed to create advisor profile for user ${user.id}: ${err.message}`)
        errors.push({ userId: user.id, error: err.message })
      }
    }

    this.logger.log(
      `Advisor profile sync complete: ${created} created, ${existingUserIds.size} skipped, ${errors.length} errors`,
    )

    // Invalidate OTA ISR cache if we created any profiles
    if (created > 0) {
      this.otaRevalidation.revalidateTag('advisors')
    }

    return {
      created,
      skipped: existingUserIds.size,
      errors,
    }
  }

  // ============================================================================
  // PRIVATE — Slug generation helpers
  // ============================================================================

  /**
   * Generate a URL-friendly slug from first + last name.
   * e.g., "Sarah Mitchell" -> "sarah-mitchell"
   */
  private generateSlug(firstName?: string | null, lastName?: string | null): string {
    const parts = [firstName, lastName].filter(Boolean).map((s) =>
      s!
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )

    return parts.join('-') || 'advisor'
  }

  /**
   * Ensure slug uniqueness by appending a counter if needed.
   * e.g., "sarah-mitchell" -> "sarah-mitchell-2" if the base already exists.
   */
  private deduplicateSlug(baseSlug: string, existingSlugs: Set<string>): string {
    if (!existingSlugs.has(baseSlug)) {
      return baseSlug
    }

    let counter = 2
    while (existingSlugs.has(`${baseSlug}-${counter}`)) {
      counter++
    }

    return `${baseSlug}-${counter}`
  }
}
