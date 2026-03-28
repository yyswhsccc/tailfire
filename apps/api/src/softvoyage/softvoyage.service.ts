/**
 * Softvoyage Service
 *
 * Orchestrates vacation package live searches via the VACATION_SEARCH BullMQ queue.
 * Handles cache lookups, job deduplication, and result polling.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import Redis from 'ioredis'
import { createHash } from 'node:crypto'
import { QUEUES, JOB_TYPES } from '../automation/automation.types'
import type { VacationSearchJobData } from '../automation/automation.types'
import type { VacationSearchResult } from './softvoyage-result-parser.service'
import { VacationLiveSearchDto } from './dto/vacation-live-search.dto'

// Default cache TTL: 15 minutes
const DEFAULT_CACHE_TTL = 900

@Injectable()
export class SoftvoyageService {
  private readonly logger = new Logger(SoftvoyageService.name)
  private readonly redis: Redis | null
  private readonly cacheTtl: number

  constructor(
    @InjectQueue(QUEUES.VACATION_SEARCH) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtl = parseInt(
      this.configService.get<string>('VACATION_PRICING_CACHE_TTL', `${DEFAULT_CACHE_TTL}`),
      10,
    )

    // Initialize Redis client for reading cached results
    const redisUrl = this.configService.get<string>('REDIS_URL')
    if (redisUrl) {
      try {
        const url = new URL(redisUrl)
        const config: Record<string, unknown> = {
          host: url.hostname,
          port: parseInt(url.port || '6379', 10),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        }
        if (url.password) config.password = url.password
        if (url.username) config.username = url.username
        if (url.protocol === 'rediss:') config.tls = {}

        this.redis = new Redis(config as ConstructorParameters<typeof Redis>[0])
        this.logger.log('Redis client initialized for vacation search service')
      } catch (err) {
        this.logger.warn(`Failed to initialize Redis client: ${err}`)
        this.redis = null
      }
    } else {
      this.logger.warn('REDIS_URL not configured — cache lookups will be skipped')
      this.redis = null
    }
  }

  // ---------------------------------------------------------------------------
  // Submit a search (cache-first, then queue)
  // ---------------------------------------------------------------------------

  async submitSearch(
    dto: VacationLiveSearchDto,
  ): Promise<
    | { cached: true; results: VacationSearchResult[]; fetchedAt: string }
    | { cached: false; jobId: string }
  > {
    const nbAdults = dto.nbAdults ?? 2
    const nbRooms = dto.nbRooms ?? 1
    const allInclusive = dto.allInclusive ?? true

    // 1. Compute deterministic cache key from search params
    const paramsHash = createHash('sha256')
      .update(
        JSON.stringify({
          allInclusive,
          dateDep: dto.dateDep,
          destDep: dto.destDep,
          duration: dto.duration,
          gatewayCode: dto.gatewayCode,
          nbAdults,
          nbRooms,
        }),
      )
      .digest('hex')

    const cacheKey = `vco:search:${paramsHash}`

    // 2. Check Redis for cached results
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey)
        if (cached) {
          this.logger.debug(`Cache hit for ${cacheKey}`)
          const parsed = JSON.parse(cached) as { results: VacationSearchResult[]; fetchedAt: string }
          return { cached: true, results: parsed.results, fetchedAt: parsed.fetchedAt }
        }
      } catch (err) {
        this.logger.warn(`Redis cache lookup failed: ${err}`)
      }
    }

    // 3. Compute a time-bucketed job ID for deduplication
    const cacheTtlMs = this.cacheTtl * 1000
    const timestampBucket = Math.floor(Date.now() / cacheTtlMs)
    const jobId = `vco-search-${paramsHash}-${timestampBucket}`

    // 4. Check if the job already exists and is active/waiting
    try {
      const existingJob = await this.queue.getJob(jobId)
      if (existingJob) {
        const state = await existingJob.getState()
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          this.logger.debug(`Job ${jobId} already ${state}, returning existing`)
          return { cached: false, jobId }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to check existing job ${jobId}: ${err}`)
    }

    // 5. Enqueue new search job
    const jobData: VacationSearchJobData = {
      gatewayCode: dto.gatewayCode,
      destDep: dto.destDep,
      dateDep: dto.dateDep,
      duration: dto.duration,
      nbAdults,
      nbRooms,
      allInclusive,
      cacheKey,
    }

    await this.queue.add(JOB_TYPES.VACATION_SEARCH, jobData, {
      jobId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 900 }, // Align with cache TTL (15 min)
      removeOnFail: { age: 3600 },
    })

    this.logger.log(
      `Enqueued vacation search: ${dto.gatewayCode} -> ${dto.destDep}, ${dto.dateDep}, ${dto.duration}n [${jobId}]`,
    )

    return { cached: false, jobId }
  }

  // ---------------------------------------------------------------------------
  // Poll for search results
  // ---------------------------------------------------------------------------

  async getSearchResults(
    jobId: string,
  ): Promise<{
    status: 'processing' | 'completed' | 'failed'
    results?: VacationSearchResult[]
    fetchedAt?: string
  }> {
    const job = await this.queue.getJob(jobId)
    if (!job) {
      return { status: 'failed' }
    }

    const state = await job.getState()

    if (state === 'completed') {
      // Read results from Redis cache using the cacheKey stored in returnvalue
      const returnValue = job.returnvalue as { cacheKey?: string; resultCount?: number } | null
      if (returnValue?.cacheKey && this.redis) {
        try {
          const cached = await this.redis.get(returnValue.cacheKey)
          if (cached) {
            const parsed = JSON.parse(cached) as { results: VacationSearchResult[]; fetchedAt: string }
            return {
              status: 'completed',
              results: parsed.results,
              fetchedAt: parsed.fetchedAt,
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to read cached results for ${jobId}: ${err}`)
        }
      }

      // Cache miss — results may have expired
      return { status: 'completed', results: [] }
    }

    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      return { status: 'processing' }
    }

    // failed, unknown, etc.
    return { status: 'failed' }
  }
}
