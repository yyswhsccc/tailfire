/**
 * Automation Admin Controller
 *
 * Admin-only endpoints for managing the automation system.
 * Protected by admin role check (implemented via guards).
 */

import { Controller, Get, Post, Delete, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger'
import { AutomationService } from '../automation.service'
import { QUEUES, type QueueName } from '../automation.types'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'

@ApiTags('Admin - Automation')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  // ============================================================================
  // Queue Status
  // ============================================================================

  @Get('queues')
  @ApiOperation({ summary: 'Get all queue counts' })
  @ApiResponse({ status: 200, description: 'Queue counts for all automation queues' })
  async getQueueCounts() {
    const counts = await this.automationService.getQueueCounts()
    return {
      queues: counts,
      timestamp: new Date().toISOString(),
    }
  }

  @Get('queues/:name/delayed')
  @ApiOperation({ summary: 'Get delayed jobs for a queue' })
  @ApiQuery({ name: 'start', required: false, type: Number })
  @ApiQuery({ name: 'end', required: false, type: Number })
  async getDelayedJobs(
    @Param('name') queueName: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const queue = queueName as QueueName
    const jobs = await this.automationService.getDelayedJobs(
      queue,
      start ? parseInt(start, 10) : 0,
      end ? parseInt(end, 10) : 100,
    )
    return {
      queue: queueName,
      jobs,
      count: jobs.length,
    }
  }

  // ============================================================================
  // Job Management
  // ============================================================================

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get job status by ID' })
  @ApiQuery({ name: 'queue', required: false, description: 'Optional queue name to search' })
  async getJobStatus(@Param('id') jobId: string, @Query('queue') queue?: string) {
    const status = await this.automationService.getStatus(jobId, queue as QueueName)
    if (!status) {
      return {
        found: false,
        jobId,
      }
    }
    return {
      found: true,
      ...status,
    }
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled job' })
  @ApiQuery({ name: 'queue', required: false, description: 'Optional queue name' })
  async cancelJob(@Param('id') jobId: string, @Query('queue') queue?: string) {
    const cancelled = await this.automationService.cancel(jobId, queue as QueueName)
    return {
      jobId,
      cancelled,
    }
  }

  // ============================================================================
  // Manual Job Scheduling (Admin only)
  // ============================================================================

  @Post('jobs/schedule')
  @ApiOperation({ summary: 'Manually schedule a job (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        queue: { type: 'string', enum: Object.values(QUEUES) },
        jobType: { type: 'string' },
        data: { type: 'object' },
        delay: { type: 'number', description: 'Delay in milliseconds' },
        runAt: { type: 'string', format: 'date-time', description: 'ISO datetime to run at' },
        jobId: { type: 'string', description: 'Optional custom job ID' },
      },
      required: ['queue', 'jobType', 'data'],
    },
  })
  async scheduleJob(
    @Body()
    body: {
      queue: QueueName
      jobType: string
      data: Record<string, unknown>
      delay?: number
      runAt?: string
      jobId?: string
    },
  ) {
    const { queue, jobType, data, delay, runAt, jobId } = body

    let scheduledJobId: string

    if (runAt) {
      scheduledJobId = await this.automationService.scheduleAt(queue, jobType, data, new Date(runAt), {
        jobId,
      })
    } else {
      scheduledJobId = await this.automationService.schedule(queue, jobType, data, {
        delay,
        jobId,
      })
    }

    return {
      jobId: scheduledJobId,
      queue,
      jobType,
      scheduled: true,
    }
  }

  // ============================================================================
  // Backfill Operations
  // ============================================================================

  @Post('trips/backfill')
  @ApiOperation({ summary: 'Trigger backfill for existing trips' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        batchSize: { type: 'number', default: 100 },
      },
    },
  })
  async triggerBackfill(@Body() body: { batchSize?: number }) {
    const jobId = await this.automationService.schedule(
      QUEUES.TRIP_AUTOMATION,
      'trip.backfill',
      {
        batchSize: body.batchSize || 100,
        offset: 0,
      },
      { priority: 10 }, // Lower priority so it doesn't block urgent jobs
    )

    return {
      jobId,
      message: 'Backfill job scheduled',
      batchSize: body.batchSize || 100,
    }
  }

  // ============================================================================
  // Pattern-based Operations
  // ============================================================================

  @Delete('jobs/pattern')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel jobs matching a pattern' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        queue: { type: 'string', enum: Object.values(QUEUES) },
        pattern: { type: 'string', description: 'Pattern with * as wildcard, e.g., "trip:*:in_progress"' },
      },
      required: ['queue', 'pattern'],
    },
  })
  async cancelByPattern(@Body() body: { queue: QueueName; pattern: string }) {
    const cancelled = await this.automationService.cancelPattern(body.pattern, body.queue)
    return {
      queue: body.queue,
      pattern: body.pattern,
      cancelled,
    }
  }
}
