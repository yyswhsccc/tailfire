/**
 * Trip Automations Controller
 *
 * Trip-scoped endpoints for managing automation jobs and insurance proposals.
 * All endpoints require JWT auth + trip access verification.
 *
 * Routes:
 * - GET  /trips/:tripId/automations         — list job history for trip
 * - POST /trips/:tripId/automations/:jobId/pause
 * - POST /trips/:tripId/automations/:jobId/resume
 * - POST /trips/:tripId/automations/:jobId/cancel
 * - GET  /trips/:tripId/insurance/preview   — preview insurance proposal
 * - POST /trips/:tripId/insurance/initiate  — queue insurance proposal emails
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger'
import { eq, and, desc } from 'drizzle-orm'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { TripAccessService } from './trip-access.service'
import { InsuranceAutomationService } from './insurance-automation.service'
import { AutomationService } from '../automation/automation.service'
import { DatabaseService } from '../db/database.service'

@ApiTags('Trip Automations')
@ApiBearerAuth()
@Controller('trips/:tripId')
export class TripAutomationsController {
  constructor(
    private readonly tripAccessService: TripAccessService,
    private readonly insuranceAutomationService: InsuranceAutomationService,
    private readonly automationService: AutomationService,
    private readonly db: DatabaseService,
  ) {}

  // ============================================================================
  // Automation Job History
  // ============================================================================

  /**
   * GET /trips/:tripId/automations
   * List all automation job history entries for a trip
   */
  @Get('automations')
  @ApiOperation({ summary: 'List automation jobs for a trip' })
  @ApiResponse({ status: 200, description: 'List of automation jobs' })
  async listAutomations(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.tripAccessService.verifyReadAccess(tripId, auth)

    const { automationJobHistory } = this.db.schema
    const jobs = await this.db.client
      .select()
      .from(automationJobHistory)
      .where(eq(automationJobHistory.tripId, tripId))
      .orderBy(desc(automationJobHistory.createdAt))

    return { tripId, jobs, count: jobs.length }
  }

  // ============================================================================
  // Job Control (pause/resume/cancel)
  // ============================================================================

  /**
   * POST /trips/:tripId/automations/:jobId/pause
   * Pause a scheduled automation job
   */
  @Post('automations/:jobId/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a scheduled automation job' })
  async pauseJob(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)

    // Verify the job belongs to this trip
    await this.verifyJobBelongsToTrip(jobId, tripId)

    // Update history status to paused
    const { automationJobHistory } = this.db.schema
    const now = new Date()
    await this.db.client
      .update(automationJobHistory)
      .set({ status: 'paused', pausedAt: now })
      .where(
        and(
          eq(automationJobHistory.jobId, jobId),
          eq(automationJobHistory.tripId, tripId),
        ),
      )

    // Cancel the BullMQ job (remove from queue) — it can be re-scheduled on resume
    await this.automationService.cancel(jobId)

    return { jobId, status: 'paused' }
  }

  /**
   * POST /trips/:tripId/automations/:jobId/resume
   * Resume a paused automation job (re-schedules it)
   */
  @Post('automations/:jobId/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused automation job' })
  async resumeJob(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)

    // Find the paused job in history
    const { automationJobHistory } = this.db.schema
    const [jobRecord] = await this.db.client
      .select()
      .from(automationJobHistory)
      .where(
        and(
          eq(automationJobHistory.jobId, jobId),
          eq(automationJobHistory.tripId, tripId),
        ),
      )
      .limit(1)

    if (!jobRecord) {
      throw new NotFoundException(`Job ${jobId} not found for trip ${tripId}`)
    }

    if (jobRecord.status !== 'paused') {
      throw new BadRequestException(`Job ${jobId} is not paused (current status: ${jobRecord.status})`)
    }

    // Re-schedule the job with original data
    const jobData = jobRecord.jobData as Record<string, unknown>

    // Calculate remaining delay if there was a scheduled time
    let delay: number | undefined
    if (jobRecord.scheduledFor) {
      const remaining = new Date(jobRecord.scheduledFor).getTime() - Date.now()
      delay = Math.max(0, remaining)
    }

    await this.automationService.schedule(
      jobRecord.queueName as Parameters<AutomationService['schedule']>[0],
      jobRecord.jobType,
      jobData,
      { delay, jobId },
    )

    // Update history status back to queued
    await this.db.client
      .update(automationJobHistory)
      .set({ status: 'queued', pausedAt: null })
      .where(
        and(
          eq(automationJobHistory.jobId, jobId),
          eq(automationJobHistory.tripId, tripId),
        ),
      )

    return { jobId, status: 'queued' }
  }

  /**
   * POST /trips/:tripId/automations/:jobId/cancel
   * Cancel a scheduled automation job permanently
   */
  @Post('automations/:jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled automation job' })
  async cancelJob(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Param('jobId') jobId: string,
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)
    await this.verifyJobBelongsToTrip(jobId, tripId)

    // Cancel in BullMQ
    await this.automationService.cancel(jobId)

    // Update history
    const { automationJobHistory } = this.db.schema
    const now = new Date()
    await this.db.client
      .update(automationJobHistory)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: auth.userId,
      })
      .where(
        and(
          eq(automationJobHistory.jobId, jobId),
          eq(automationJobHistory.tripId, tripId),
        ),
      )

    return { jobId, status: 'cancelled' }
  }

  // ============================================================================
  // Insurance Automation
  // ============================================================================

  /**
   * GET /trips/:tripId/insurance/preview
   * Preview insurance proposal: list travelers, ages, minor detection, guardians
   */
  @Get('insurance/preview')
  @ApiOperation({ summary: 'Preview insurance proposal for trip travelers' })
  @ApiResponse({ status: 200, description: 'Travelers with insurance status and minor detection' })
  async getInsurancePreview(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
  ) {
    await this.tripAccessService.verifyReadAccess(tripId, auth)
    return this.insuranceAutomationService.getProposalPreview(tripId)
  }

  /**
   * POST /trips/:tripId/insurance/initiate
   * Queue insurance proposal emails for selected travelers
   */
  @Post('insurance/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Queue insurance proposal emails' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        travelerIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trip traveler IDs for adult recipients',
        },
        guardianOverrides: {
          type: 'object',
          description: 'Map of minorTravelerId → guardianTravelerId overrides',
        },
        scheduledFor: {
          type: 'string',
          format: 'date-time',
          description: 'ISO date for delayed send',
        },
      },
      required: ['travelerIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'Emails queued successfully' })
  async initiateInsurance(
    @GetAuthContext() auth: AuthContext,
    @Param('tripId') tripId: string,
    @Body()
    body: {
      travelerIds: string[]
      guardianOverrides?: Record<string, string>
      scheduledFor?: string
    },
  ) {
    await this.tripAccessService.verifyWriteAccess(tripId, auth)

    if (!body.travelerIds || body.travelerIds.length === 0) {
      throw new BadRequestException('travelerIds must contain at least one traveler')
    }

    return this.insuranceAutomationService.queueProposalEmails(tripId, {
      travelerIds: body.travelerIds,
      guardianOverrides: body.guardianOverrides,
      scheduledFor: body.scheduledFor,
      agencyId: auth.agencyId,
      userId: auth.userId,
    })
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async verifyJobBelongsToTrip(jobId: string, tripId: string): Promise<void> {
    const { automationJobHistory } = this.db.schema
    const [job] = await this.db.client
      .select({ id: automationJobHistory.id })
      .from(automationJobHistory)
      .where(
        and(
          eq(automationJobHistory.jobId, jobId),
          eq(automationJobHistory.tripId, tripId),
        ),
      )
      .limit(1)

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found for trip ${tripId}`)
    }
  }
}
