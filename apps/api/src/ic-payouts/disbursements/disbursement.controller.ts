/**
 * DisbursementController
 *
 * Admin-only endpoints for managing IC commission payout disbursements.
 *
 * Endpoints:
 *   GET  /ic-payouts/admin/disbursements            — list disbursements (optionally filter by status)
 *   GET  /ic-payouts/admin/disbursements/:id        — detail with invoice + attempts
 *   POST /ic-payouts/admin/disbursements/:id/mark-sent   — mark disbursement sent (ref + optional proof)
 *   POST /ic-payouts/admin/disbursements/:id/mark-failed — mark disbursement failed (reason + reversal)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { zodValidation } from '../../common/pipes'
import { DisbursementService } from './disbursement.service'
import type { IcDisbursementStatus } from './disbursement.service'
import { StorageService } from '../../trips/storage.service'
import {
  markSentSchema,
  markFailedSchema,
  type MarkSentDto,
  type MarkFailedDto,
} from './dto/disbursement-dto'

const ALLOWED_PROOF_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/heic']

@ApiTags('IC Payouts — Disbursements')
@Controller('ic-payouts/admin/disbursements')
@AdminOnly()
export class DisbursementController {
  constructor(
    private readonly service: DisbursementService,
    private readonly storage: StorageService,
  ) {}

  /**
   * GET /ic-payouts/admin/disbursements
   * Lists all disbursements for the agency, optionally filtered by status.
   * Useful for the admin disbursement queue view (Task 35).
   *
   * Example: ?status=sending — shows all disbursements awaiting manual send.
   */
  @Get()
  async list(
    @GetAuthContext() auth: AuthContext,
    @Query('status') status?: string,
  ) {
    return this.service.listForAdmin(auth.agencyId, status as IcDisbursementStatus | undefined)
  }

  /**
   * GET /ic-payouts/admin/disbursements/:id
   * Full detail for a single disbursement — includes the parent invoice and
   * all attempt history. The destination account mask is included; decrypting
   * cleartext account details is audit-logged by IcPayoutAccountsService.
   */
  @Get(':id')
  async getDetail(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.service.getDetailForAdmin(auth.agencyId, id)
  }

  /**
   * POST /ic-payouts/admin/disbursements/:id/mark-sent
   * Marks a disbursement as sent. Requires the disbursement to be in 'sending' status.
   * Body: { reference: string, proofPath?: string }
   *
   * The proofPath is a storage path returned by an earlier upload to /storage.
   * Atomically: appends 'sent' attempt, sets status='sent', completedAt=now().
   * FX snapshot is set to NULL here — Task 37 will populate it via FxRateService.
   */
  @Post(':id/mark-sent')
  @UsePipes(zodValidation(markSentSchema))
  async markSent(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: MarkSentDto,
  ) {
    return this.service.markSent(id, body.reference, body.proofPath ?? null, auth.userId)
  }

  /**
   * POST /ic-payouts/admin/disbursements/:id/mark-failed
   * Marks a disbursement as failed. Requires 'queued' or 'sending' status.
   * Body: { reason: string }
   *
   * Atomically:
   *  1. Appends 'failed' attempt with reason.
   *  2. Reverses the invoice reservation (deletes settlements, flips adjustments to pending,
   *     cancels the reservation commission check).
   *  3. Sets invoice.status='cancelled', disbursement.status='failed'.
   */
  @Post(':id/mark-failed')
  @UsePipes(zodValidation(markFailedSchema))
  async markFailed(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: MarkFailedDto,
  ) {
    return this.service.fail(id, body.reason, auth.userId)
  }

  /**
   * POST /ic-payouts/admin/disbursements/:id/upload-proof
   * Uploads a payment proof file (PDF, PNG, JPEG, HEIC) to storage.
   * Returns a storagePath that can be passed to mark-sent as proofPath.
   *
   * Upload happens BEFORE mark-sent — the UI calls this first, then passes
   * the returned storagePath to the mark-sent body.
   */
  @Post(':id/upload-proof')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProof(
    @GetAuthContext() _auth: AuthContext,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ storagePath: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    if (!ALLOWED_PROOF_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type ${file.mimetype}. Allowed: PDF, PNG, JPEG, HEIC.`,
      )
    }
    const storagePath = await this.storage.uploadDocument(
      file.buffer,
      `ic-payout-proofs/${id}`,
      file.originalname,
      file.mimetype,
    )
    return { storagePath }
  }
}
