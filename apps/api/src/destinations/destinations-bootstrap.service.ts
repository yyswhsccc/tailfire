/**
 * Destinations Bootstrap Service
 *
 * Seeds destination records from the cruise ports catalog (~7,203 ports).
 * Handles:
 * - Slug generation (URL-friendly, country-code suffixed)
 * - Name normalization (ASCII-folded, lowercased)
 * - Geographic deduplication (ports within 50km with similar names → same destination)
 * - Batch inserts with ON CONFLICT DO NOTHING
 * - destination_ports mapping records
 */

import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../db/database.service'
import { sql } from 'drizzle-orm'

// ============================================================================
// Helpers
// ============================================================================

/**
 * ASCII-fold accented characters: Dubrovník → dubrovnik, São Paulo → sao paulo
 */
function asciiFold(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
}

/**
 * Normalize a name for dedup matching:
 * lowercase, ASCII-fold, strip non-alphanumeric (except spaces)
 */
function normalizeName(name: string): string {
  return asciiFold(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate a URL-friendly slug from a port name + country code.
 *
 * Rules:
 * - Remove parenthetical clarifiers: "Cozumel (Mexico)" → "cozumel"
 * - Handle commas: "Miami, FL" → "miami-fl"
 * - Append country code if available: "miami-fl-us"
 * - ASCII-fold accented chars: "Dubrovník" → "dubrovnik"
 * - Collapse multiple hyphens, trim leading/trailing hyphens
 */
function generateSlug(name: string, countryCode?: string): string {
  let slug = asciiFold(name)
    .toLowerCase()
    // Remove parenthetical clarifiers
    .replace(/\s*\(.*?\)\s*/g, '')
    // Replace non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    // Trim leading/trailing hyphens
    .replace(/^-|-$/g, '')

  // Append country code if available and not already in slug
  if (countryCode) {
    const cc = countryCode.toLowerCase()
    if (!slug.endsWith(`-${cc}`)) {
      slug = `${slug}-${cc}`
    }
  }

  return slug
}

/**
 * Haversine distance between two lat/lng points, in kilometers.
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Extract a 2-letter country code from cruise port metadata.
 * The metadata.country field may be a full name, 2-letter code, or 3-letter code.
 * We only accept 2-letter codes directly; otherwise return undefined.
 */
function extractCountryCode(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata) return undefined

  // Check country_code field first (most reliable)
  if (typeof metadata.country_code === 'string' && metadata.country_code.length === 2) {
    return metadata.country_code.toUpperCase()
  }

  // Check country field — only if it's a 2-letter ISO code
  if (typeof metadata.country === 'string' && /^[a-zA-Z]{2}$/.test(metadata.country)) {
    return metadata.country.toUpperCase()
  }

  return undefined
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class DestinationsBootstrapService {
  private readonly logger = new Logger(DestinationsBootstrapService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Seed destinations from the cruise ports catalog.
   *
   * 1. Query ALL cruise_ports from catalog schema
   * 2. Deduplicate: ports within 50km with similar normalized names → same destination
   * 3. Insert destination records (ON CONFLICT DO NOTHING on slug)
   * 4. Create destination_ports mapping records
   */
  async seedFromCruisePorts(): Promise<{
    created: number
    mapped: number
    skipped: number
    totalPorts: number
  }> {
    const { cruisePorts, destinations, destinationPorts } = this.db.schema

    // Step 1: Fetch all cruise ports
    this.logger.log('Fetching all cruise ports from catalog...')
    const allPorts = await this.db.client.select().from(cruisePorts)
    this.logger.log(`Found ${allPorts.length} cruise ports`)

    if (allPorts.length === 0) {
      return { created: 0, mapped: 0, skipped: 0, totalPorts: 0 }
    }

    // Step 2: Group ports into destination clusters (dedup by name + geography)
    //
    // Each cluster = one destination, potentially mapped to multiple ports.
    // A port joins an existing cluster if:
    //   - normalized names are identical AND
    //   - either both lack coordinates, or they're within 50km
    type PortRecord = typeof allPorts[number]
    type Cluster = {
      slug: string
      name: string
      normalizedName: string
      countryCode?: string
      latitude?: number
      longitude?: number
      ports: PortRecord[]
    }

    const clusters: Cluster[] = []

    for (let i = 0; i < allPorts.length; i++) {
      const port = allPorts[i]!
      const metadata = (port.metadata ?? {}) as Record<string, unknown>
      const portName = port.name
      const portNorm = normalizeName(portName)
      const countryCode = extractCountryCode(metadata)
      const lat = typeof metadata.latitude === 'number' ? metadata.latitude : undefined
      const lon = typeof metadata.longitude === 'number' ? metadata.longitude : undefined

      // Try to find an existing cluster with the same normalized name
      let matched = false
      for (const cluster of clusters) {
        if (cluster.normalizedName !== portNorm) continue

        // Name matches — check geographic proximity if both have coordinates
        if (lat != null && lon != null && cluster.latitude != null && cluster.longitude != null) {
          const dist = haversineKm(lat, lon, cluster.latitude, cluster.longitude)
          if (dist > 50) continue // Same name but too far apart — different destination
        }

        // Match! Add port to existing cluster
        cluster.ports.push(port)
        matched = true
        break
      }

      if (!matched) {
        // Create a new cluster
        clusters.push({
          slug: generateSlug(portName, countryCode),
          name: portName,
          normalizedName: portNorm,
          countryCode,
          latitude: lat,
          longitude: lon,
          ports: [port],
        })
      }

      // Log progress every 500 ports
      if ((i + 1) % 500 === 0) {
        this.logger.log(`Processed ${i + 1}/${allPorts.length} ports → ${clusters.length} clusters so far`)
      }
    }

    this.logger.log(
      `Clustering complete: ${allPorts.length} ports → ${clusters.length} unique destinations`,
    )

    // Step 3: Insert destinations (batch, ON CONFLICT DO NOTHING on slug)
    let created = 0
    let mapped = 0
    let skipped = 0

    // Handle potential slug collisions within clusters (different names could generate same slug)
    const slugSet = new Set<string>()
    for (const cluster of clusters) {
      if (slugSet.has(cluster.slug)) {
        // Append a suffix to make slug unique
        let suffix = 2
        while (slugSet.has(`${cluster.slug}-${suffix}`)) {
          suffix++
        }
        cluster.slug = `${cluster.slug}-${suffix}`
      }
      slugSet.add(cluster.slug)
    }

    // Process in batches of 200 clusters
    const BATCH_SIZE = 200
    for (let batchStart = 0; batchStart < clusters.length; batchStart += BATCH_SIZE) {
      const batch = clusters.slice(batchStart, batchStart + BATCH_SIZE)

      // Insert destinations
      const destValues = batch.map((cluster) => ({
        slug: cluster.slug,
        name: cluster.name,
        normalizedName: cluster.normalizedName,
        destinationType: 'port_city' as const,
        countryCode: cluster.countryCode ?? null,
        latitude: cluster.latitude?.toString() ?? null,
        longitude: cluster.longitude?.toString() ?? null,
        sourceStatus: 'seeded' as const,
        contentStatus: 'seeded' as const,
        metadata: {},
      }))

      const inserted = await this.db.client
        .insert(destinations)
        .values(destValues)
        .onConflictDoNothing({ target: destinations.slug })
        .returning({ id: destinations.id, slug: destinations.slug })

      created += inserted.length
      skipped += batch.length - inserted.length

      // Build a slug → id map for the inserted destinations
      const slugToId = new Map<string, string>()
      for (const row of inserted) {
        slugToId.set(row.slug, row.id)
      }

      // For skipped (already existed) destinations, look up their IDs by slug
      const missingSlugs = batch
        .map((c) => c.slug)
        .filter((s) => !slugToId.has(s))

      if (missingSlugs.length > 0) {
        const existing = await this.db.client
          .select({ id: destinations.id, slug: destinations.slug })
          .from(destinations)
          .where(sql`${destinations.slug} = ANY(${missingSlugs})`)

        for (const row of existing) {
          slugToId.set(row.slug, row.id)
        }
      }

      // Insert destination_ports mapping records
      const portMappings: Array<{
        destinationId: string
        portId: string
        matchMethod: string
        confidence: string
        isPrimary: boolean
      }> = []

      for (const cluster of batch) {
        const destId = slugToId.get(cluster.slug)
        if (!destId) continue

        for (let j = 0; j < cluster.ports.length; j++) {
          portMappings.push({
            destinationId: destId,
            portId: cluster.ports[j]!.id,
            matchMethod: 'seed',
            confidence: '1.0',
            isPrimary: j === 0, // First port in cluster is primary
          })
        }
      }

      if (portMappings.length > 0) {
        const mappingResult = await this.db.client
          .insert(destinationPorts)
          .values(portMappings)
          .onConflictDoNothing()
          .returning({ destinationId: destinationPorts.destinationId })

        mapped += mappingResult.length
      }

      this.logger.log(
        `Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ` +
          `${inserted.length} destinations created, ${portMappings.length} port mappings`,
      )
    }

    this.logger.log(
      `Bootstrap complete: ${created} destinations created, ${mapped} port mappings, ${skipped} skipped (already existed)`,
    )

    return {
      created,
      mapped,
      skipped,
      totalPorts: allPorts.length,
    }
  }
}
