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
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common'
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
  type SubmitClaimZodDto,
  type RejectInvoiceDto,
} from './dto/submit-claim.dto'

@ApiTags('IC Payouts')
@Controller('ic-payouts')
export class IcInvoiceController {
  constructor(
    private readonly service: IcInvoiceService,
    private readonly storage: StorageService,
  ) {}

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
    return this.service.getEligibleForUser(auth.agencyId, auth.userId)
  }

  /**
   * POST /ic-payouts/me/claims
   * Submit a commission claim. Creates one IcInvoice per currency covering
   * the selected check items + all pending adjustments in the same currency.
   *
   * Body: { selectedCheckItemIds: string[] }
   * Returns: { invoices: IcInvoice[] }
   */
  @Post('me/claims')
  @UsePipes(zodValidation(submitClaimSchema))
  async submitClaim(
    @GetAuthContext() auth: AuthContext,
    @Body() body: SubmitClaimZodDto,
  ) {
    return this.service.submitClaim({
      agencyId: auth.agencyId,
      userId: auth.userId,
      selectedCheckItemIds: body.selectedCheckItemIds,
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
