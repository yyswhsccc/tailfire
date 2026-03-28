import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface UnsplashPhoto {
  id: string
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  description: string | null
  alt_description: string | null
  user: {
    name: string
    links: { html: string }
  }
}

@Injectable()
export class UnsplashService {
  private readonly logger = new Logger(UnsplashService.name)
  private readonly accessKey: string | undefined
  private lastRequestAt = 0
  private readonly minRequestIntervalMs = 200 // 5 req/sec max

  constructor(private readonly config: ConfigService) {
    this.accessKey = this.config.get<string>('UNSPLASH_ACCESS_KEY')
    if (!this.accessKey) {
      this.logger.warn('UNSPLASH_ACCESS_KEY not configured — Unsplash fallback disabled')
    }
  }

  isConfigured(): boolean {
    return !!this.accessKey
  }

  async searchPhoto(query: string): Promise<{ imageUrl: string; attribution: string } | null> {
    if (!this.accessKey) return null

    // Rate limiting
    const now = Date.now()
    const elapsed = now - this.lastRequestAt
    if (elapsed < this.minRequestIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestIntervalMs - elapsed))
    }
    this.lastRequestAt = Date.now()

    try {
      const params = new URLSearchParams({
        query,
        per_page: '1',
        orientation: 'landscape',
        content_filter: 'high',
      })

      const response = await fetch(
        `https://api.unsplash.com/search/photos?${params}`,
        {
          headers: {
            Authorization: `Client-ID ${this.accessKey}`,
          },
        },
      )

      if (!response.ok) {
        this.logger.error(`Unsplash returned ${response.status}: ${response.statusText}`)
        return null
      }

      const data = (await response.json()) as { results: UnsplashPhoto[] }

      if (!data.results || data.results.length === 0) {
        return null
      }

      const photo = data.results[0]!
      // Use 'regular' size (1080px wide) — good balance of quality and load time
      return {
        imageUrl: photo.urls.regular,
        attribution: `Photo by ${photo.user.name} on Unsplash`,
      }
    } catch (error) {
      this.logger.error(`Unsplash search failed for "${query}": ${error}`)
      return null
    }
  }
}
