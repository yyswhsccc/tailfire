// apps/api/src/destinations/wikipedia.service.ts

import { Injectable, Logger } from '@nestjs/common'

export interface WikipediaSummary {
  title: string
  extract: string         // Plain text summary (2-3 paragraphs)
  description?: string    // Short tagline
  thumbnail?: { source: string; width: number; height: number }
  coordinates?: { lat: number; lon: number }
}

@Injectable()
export class WikipediaService {
  private readonly logger = new Logger(WikipediaService.name)

  /**
   * Fetch a Wikipedia summary for a destination.
   * Uses the REST API which is free and has generous rate limits (200/sec).
   */
  async fetchSummary(query: string): Promise<WikipediaSummary | null> {
    try {
      // First search for the page title
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'PhoenixVoyages/1.0 (travel agency enrichment)' },
      })
      if (!searchRes.ok) return null

      const searchData = (await searchRes.json()) as { query?: { search?: { title: string }[] } }
      const pageTitle = searchData?.query?.search?.[0]?.title
      if (!pageTitle) return null

      // Then fetch the summary
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'PhoenixVoyages/1.0 (travel agency enrichment)' },
      })
      if (!summaryRes.ok) return null

      const data = (await summaryRes.json()) as {
        title: string
        extract?: string
        description?: string
        thumbnail?: { source: string; width: number; height: number }
        coordinates?: { lat: number; lon: number }
      }

      return {
        title: data.title,
        extract: data.extract || '',
        description: data.description,
        thumbnail: data.thumbnail,
        coordinates: data.coordinates,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Wikipedia fetch failed for "${query}": ${message}`)
      return null
    }
  }
}
