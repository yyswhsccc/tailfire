/**
 * IcInvoiceController
 *
 * REST API endpoints for IC commission invoice submission and admin review.
 *
 * IC routes (authenticated user must be an IC agent in the agency):
 *   GET  /ic-payouts/me/eligible            — eligible items + adjustments grouped by currency
 *   POST /ic-payouts/me/claims              — submit a claim (creates invoices, 1 per currency)
 *   GET  /ic-payouts/me/invoices            — list IC's own invoices
 *   GET  /ic-payouts/me/invoices/:id        — detail with lines + signed PDF URL
 *
 * Admin routes (AdminOnly):
 *   GET  /ic-payouts/admin/invoices         — review queue (optionally filtered by status)
 *   GET  /ic-payouts/admin/invoices/:id     — detail with audit data + signed PDF URL
 *   POST /ic-payouts/admin/invoices/:id/approve — approve a submitted invoice
 *   POST /ic-payouts/admin/invoices/:id/reject  — reject with reason
 *   POST /ic-payouts/admin/invoices/:id/cancel  — admin cancel (duplicate / stuck)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UsePipes,
  GoneException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../../auth/auth.types'
import { zodValidation } from '../../common/pipes'
import { IcInvoiceService } from './ic-invoice.service'
import type { IcInvoiceStatus } from './ic-invoice.service'
import { StorageService } from '../../trips/storage.service'
import {
  submitClaimSchema,
  rejectInvoiceSchema,
  cancelInvoiceSchema,
  type SubmitClaimZodDto,
  type RejectInvoiceDto,
  type CancelInvoiceDto,
} from './dto/submit-claim.dto'

@ApiTags('IC Payouts')
@Controller('ic-payouts')
export class IcInvoiceController {
  constructor(
    private readonly service: IcInvoiceService,
    private readonly storage: StorageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Symmetric gate to the legacy CommissionController's isIcPayoutsV2Enabled()
   * check. When `IC_PAYOUTS_V2_ENABLED=false` (the default while V2 math is
   * being rebuilt), the money-path V2 endpoints return 410 Gone. Browse/admin
   * endpoints that don't compute money (list invoices, approve/reject/cancel)
   * remain open so any in-flight invoices can be cleaned up.
   *
   * Without this gate, IC v2's claim path silently issues invoices with the
   * gross supplier `received_cents` as the line amount — no fee, split, or
   * tax applied. See PR-0 in docs/runbooks/commission-rebuild-plan.md.
   */
  private assertV2MoneyPathReady(endpoint: string): void {
    const enabled = this.configService.get<string>('IC_PAYOUTS_V2_ENABLED') === 'true'
    if (!enabled) {
      throw new GoneException(
        `IC Payouts V2 money-path endpoint (${endpoint}) is disabled while the commission ` +
          'formula and reconciliation gate are being rebuilt. See docs/runbooks/commission-rebuild-plan.md.'
      )
    }
  }

  // ==========================================================================
  // IC routes
  // ==========================================================================

  /**
   * GET /ic-payouts/me/eligible
   * Returns all eligible commission items and pending adjustments for the
   * authenticated IC agent, grouped by currency.
   *
   * The IC browses this BEFORE selecting items to include in a claim.
   */
  @Get('me/eligible')
  async getEligible(@GetAuthContext() auth: AuthContext) {
    this.assertV2MoneyPathReady('GET /ic-payouts/me/eligible')
    return this.service.getEligibleForUser(auth.agencyId, auth.userId)
  }

  /**
   * POST /ic-payouts/me/claims
   * Submit a commission claim. Creates one IcInvoice per currency covering
   * the selected check items + opted-in positive adjustments + all
   * negative (clawback) adjustments in the same currency.
   *
   * PR-1: `optedInAdjustmentIds` is now wired through. Without this field
   * the IC's positive pending adjustments stay pending for a future claim.
   *
   * Body: { selectedCheckItemIds: string[], optedInAdjustmentIds?: string[] }
   * Returns: { invoices: IcInvoice[] }
   */
  @Post('me/claims')
  @UsePipes(zodValidation(submitClaimSchema))
  async submitClaim(
    @GetAuthContext() auth: AuthContext,
    @Body() body: SubmitClaimZodDto,
  ) {
    this.assertV2MoneyPathReady('POST /ic-payouts/me/claims')
    return this.service.submitClaim({
      agencyId: auth.agencyId,
      userId: auth.userId,
      selectedCheckItemIds: body.selectedCheckItemIds,
      optedInAdjustmentIds: body.optedInAdjustmentIds,
    })
  }

  /**
   * GET /ic-payouts/me/invoices
   * List all invoices submitted by the authenticated IC agent.
   */
  @Get('me/invoices')
  async listMyInvoices(@GetAuthContext() auth: AuthContext) {
    return this.service.listForUser(auth.agencyId, auth.userId)
  }

  /**
   * GET /ic-payouts/me/invoices/:id
   * Fetch a specific invoice (IC must own it) with its lines and a
   * signed PDF download URL (valid for 1 hour).
   */
  @Get('me/invoices/:id')
  async getMyInvoice(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const detail = await this.service.getInvoiceDetail(
      auth.agencyId,
      id,
      auth.userId,
      false, // non-admin: ownership enforced
    )
    return this.withSignedPdfUrl(detail)
  }

  // ==========================================================================
  // Admin routes
  // ==========================================================================

  /**
   * GET /ic-payouts/admin/invoices
   * Admin review queue. Optionally filter by status (?status=submitted).
   */
  @Get('admin/invoices')
  @AdminOnly()
  async listAdminInvoices(
    @GetAuthContext() auth: AuthContext,
    @Query('status') status?: string,
  ) {
    return this.service.listForAdmin(auth.agencyId, status as IcInvoiceStatus | undefined)
  }

  /**
   * GET /ic-payouts/admin/invoices/:id
   * Admin view of an invoice — same detail as the IC view but without the
   * ownership guard, so admins can view any invoice in their agency.
   * Includes signed PDF URL.
   */
  @Get('admin/invoices/:id')
  @AdminOnly()
  async getAdminInvoice(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const detail = await this.service.getInvoiceDetail(
      auth.agencyId,
      id,
      auth.userId,
      true, // admin: no ownership filter
    )
    return this.withSignedPdfUrl(detail)
  }

  /**
   * POST /ic-payouts/admin/invoices/:id/approve
   * Approve a submitted invoice. Atomically flips status submitted → approved
   * and marks the reservation paid check as accepted.
   */
  @Post('admin/invoices/:id/approve')
  @AdminOnly()
  async approve(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.service.approve(id, auth.userId)
  }

  /**
   * POST /ic-payouts/admin/invoices/:id/reject
   * Reject a submitted or approved invoice. Reverses the reservation:
   * deletes settlements, flips adjustments back to pending, cancels paid check.
   *
   * Body: { reason: string }
   */
  @Post('admin/invoices/:id/reject')
  @AdminOnly()
  @UsePipes(zodValidation(rejectInvoiceSchema))
  async reject(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: RejectInvoiceDto,
  ) {
    return this.service.reject(id, body.reason, auth.userId)
  }

  /**
   * POST /ic-payouts/admin/invoices/:id/cancel
   * Admin override for stuck or duplicate invoices. Allowed on
   * draft/submitted/approved. Blocked when a disbursement is already
   * in-flight (sending) or sent — those need a clawback / reversal
   * flow, not a cancel.
   *
   * Body: { reason: string }
   */
  @Post('admin/invoices/:id/cancel')
  @AdminOnly()
  @UsePipes(zodValidation(cancelInvoiceSchema))
  async cancel(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: CancelInvoiceDto,
  ) {
    return this.service.cancel(id, body.reason, auth.userId)
  }

  // ==========================================================================
  // Admin "on-behalf-of" claim generation
  //
  // Lets an admin start a claim for a specific IC. The resulting invoice
  // still belongs to the IC (user_id = target). The admin's id is recorded
  // via SubmitClaimInput.submittedByAdminUserId so the audit event
  // attributes the actor while approval still requires a separate admin
  // step (an admin can't self-approve a claim they generated).
  // ==========================================================================

  /**
   * GET /ic-payouts/admin/users/:userId/eligible
   * Admin-side mirror of /ic-payouts/me/eligible. Returns the target IC's
   * eligible items and pending adjustments grouped by currency so the
   * admin can pick which items to include when generating a claim.
   */
  @Get('admin/users/:userId/eligible')
  @AdminOnly()
  async getEligibleForAgent(
    @GetAuthContext() auth: AuthContext,
    @Param('userId') userId: string,
  ) {
    this.assertV2MoneyPathReady('GET /ic-payouts/admin/users/:userId/eligible')
    return this.service.getEligibleForUser(auth.agencyId, userId)
  }

  /**
   * POST /ic-payouts/admin/users/:userId/claims
   * Submit a claim on behalf of an IC. Identical semantics to
   * /ic-payouts/me/claims except the target user is the URL param and the
   * audit event records the admin actor. PR-1: forwards optedInAdjustmentIds.
   */
  @Post('admin/users/:userId/claims')
  @AdminOnly()
  @UsePipes(zodValidation(submitClaimSchema))
  async submitClaimForAgent(
    @GetAuthContext() auth: AuthContext,
    @Param('userId') userId: string,
    @Body() body: SubmitClaimZodDto,
  ) {
    this.assertV2MoneyPathReady('POST /ic-payouts/admin/users/:userId/claims')
    return this.service.submitClaim({
      agencyId: auth.agencyId,
      userId,
      submittedByAdminUserId: auth.userId,
      selectedCheckItemIds: body.selectedCheckItemIds,
      optedInAdjustmentIds: body.optedInAdjustmentIds,
    })
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Enriches an invoice detail response with a signed PDF download URL.
   * The URL is valid for 1 hour (3600s). If no PDF has been generated yet
   * (e.g., Puppeteer failed during submission), pdfUrl is null.
   */
  private async withSignedPdfUrl(detail: Record<string, unknown> & { pdfStoragePath?: string | null }) {
    if (!detail.pdfStoragePath) return { ...detail, pdfUrl: null }
    const pdfUrl = await this.storage.getSignedUrl(detail.pdfStoragePath, 3600)
    return { ...detail, pdfUrl }
  }
}
