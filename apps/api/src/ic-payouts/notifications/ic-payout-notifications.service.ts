/**
 * IcPayoutNotificationsService
 *
 * @OnEvent listeners for the seven IC payout lifecycle events.
 * Plain-text + simple HTML email templates inline (no template registry).
 *
 * Admin recipients resolved by lookup on user_profiles WHERE role = 'admin'
 * AND agency_id matches. If no recipients found, logs WARN and no-ops.
 *
 * Listener failures do NOT propagate back to the producer — EventEmitter2
 * catches errors in async handlers. We log errors so admins can investigate.
 *
 * Events handled:
 *   ic-payout.invoice.submitted             → admin email (skipped on auto-approve path)
 *   ic-payout.invoice.approved              → IC email
 *   ic-payout.invoice.rejected              → IC email (includes reason)
 *   ic-payout.invoice.cancelled             → IC email (admin override; includes reason)
 *   ic-payout.disbursement.awaiting-manual-send → admin email (with rail + mask)
 *   ic-payout.disbursement.sent             → IC email (with reference)
 *   ic-payout.disbursement.failed           → both IC + admin
 *   ic-payout.disbursement.returned         → no-op placeholder (Phase 2 v2 webhook only)
 */

import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { eq, and, inArray } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { EmailService } from '../../email/email.service'
import { schema } from '@tailfire/database'

const { userProfiles } = schema

// ─── Event payload interfaces ─────────────────────────────────────────────────

export interface InvoiceSubmittedEvent {
  invoiceId: string
  agencyId: string
  userId: string
  currency: string
  totalCents: number
  autoApproved: boolean
}

export interface InvoiceApprovedEvent {
  invoiceId: string
  agencyId: string
  userId: string
  totalCents: number
  currency: string
  approvedBy: string
}

export interface InvoiceRejectedEvent {
  invoiceId: string
  agencyId: string
  userId: string
  reason: string
  rejectedBy: string
}

export interface InvoiceCancelledEvent {
  invoiceId: string
  agencyId: string
  userId: string
  reason: string
  cancelledBy: string
}

export interface DisbursementAwaitingManualSendEvent {
  disbursementId: string
  invoiceId: string
  agencyId: string
  userId: string
  currency: string
  amountCents: number
  rail: string
  mask: string
}

export interface DisbursementSentEvent {
  disbursementId: string
  invoiceId: string
  agencyId: string
  userId: string
  currency: string
  amountCents: number
  reference: string
  completedAt: Date
}

export interface DisbursementFailedEvent {
  disbursementId: string
  invoiceId: string
  agencyId: string
  userId: string
  currency: string
  amountCents: number
  reason: string
  failedBy: string
}

export interface DisbursementReturnedEvent {
  disbursementId: string
  invoiceId: string
  agencyId: string
  userId: string
  currency: string
  amountCents: number
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IcPayoutNotificationsService {
  private readonly logger = new Logger(IcPayoutNotificationsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly email: EmailService,
  ) {}

  // ===========================================================================
  // invoice.submitted → admin email (skipped on auto-approve path)
  // ===========================================================================

  @OnEvent('ic-payout.invoice.submitted')
  async onInvoiceSubmitted(payload: InvoiceSubmittedEvent): Promise<void> {
    try {
      if (payload.autoApproved) {
        this.logger.log(
          `[ic-payouts] Skipping admin notification for invoice ${payload.invoiceId} — auto-approved`,
        )
        return
      }

      const recipients = await this.getAdminEmails(payload.agencyId)
      if (recipients.length === 0) {
        this.logger.warn(
          `[ic-payouts] No admin recipients for agency ${payload.agencyId}; skipping invoice.submitted email`,
        )
        return
      }

      const amount = this.formatAmount(payload.currency, payload.totalCents)
      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: recipients,
        subject: `[IC Payout] New invoice submitted (${amount})`,
        html: `
          <p>An IC has submitted a new commission claim for review.</p>
          <p>
            <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
            <strong>Amount:</strong> ${amount}
          </p>
          <p><a href="${this.adminInvoiceUrl(payload.invoiceId)}">Review in admin</a></p>
        `,
        text: `An IC has submitted a new commission claim. Invoice ${payload.invoiceId} — ${amount}. Review at ${this.adminInvoiceUrl(payload.invoiceId)}`,
        templateSlug: 'ic-payout.invoice.submitted',
      })

      this.logger.log(
        `[ic-payouts] Admin notification sent for submitted invoice ${payload.invoiceId} to ${recipients.length} recipient(s)`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send invoice.submitted notification for ${payload.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // invoice.approved → IC email
  // ===========================================================================

  @OnEvent('ic-payout.invoice.approved')
  async onInvoiceApproved(payload: InvoiceApprovedEvent): Promise<void> {
    try {
      const recipient = await this.getUserEmail(payload.userId)
      if (!recipient) {
        this.logger.warn(
          `[ic-payouts] No email found for user ${payload.userId}; skipping invoice.approved notification`,
        )
        return
      }

      const amount = this.formatAmount(payload.currency, payload.totalCents)
      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: [recipient],
        subject: `[IC Payout] Claim approved — payout in progress`,
        html: `
          <p>Your commission claim has been approved.</p>
          <p>
            <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
            <strong>Amount:</strong> ${amount}
          </p>
          <p>Payout will be sent shortly to your default account.</p>
        `,
        text: `Your commission claim has been approved. Invoice ${payload.invoiceId} — ${amount}. Payout will be sent shortly to your default account.`,
        templateSlug: 'ic-payout.invoice.approved',
      })

      this.logger.log(
        `[ic-payouts] Approval notification sent for invoice ${payload.invoiceId} to ${recipient}`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send invoice.approved notification for ${payload.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // invoice.rejected → IC email (includes reason)
  // ===========================================================================

  @OnEvent('ic-payout.invoice.rejected')
  async onInvoiceRejected(payload: InvoiceRejectedEvent): Promise<void> {
    try {
      const recipient = await this.getUserEmail(payload.userId)
      if (!recipient) {
        this.logger.warn(
          `[ic-payouts] No email found for user ${payload.userId}; skipping invoice.rejected notification`,
        )
        return
      }

      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: [recipient],
        subject: `[IC Payout] Claim rejected`,
        html: `
          <p>Your commission claim has been rejected.</p>
          <p>
            <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
            <strong>Reason:</strong> ${payload.reason}
          </p>
          <p>If you have questions, please contact your agency administrator.</p>
        `,
        text: `Your commission claim has been rejected. Invoice ${payload.invoiceId}. Reason: ${payload.reason}. If you have questions, please contact your agency administrator.`,
        templateSlug: 'ic-payout.invoice.rejected',
      })

      this.logger.log(
        `[ic-payouts] Rejection notification sent for invoice ${payload.invoiceId} to ${recipient}`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send invoice.rejected notification for ${payload.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // invoice.cancelled → IC email (admin override; includes reason)
  // ===========================================================================

  @OnEvent('ic-payout.invoice.cancelled')
  async onInvoiceCancelled(payload: InvoiceCancelledEvent): Promise<void> {
    try {
      const recipient = await this.getUserEmail(payload.userId)
      if (!recipient) {
        this.logger.warn(
          `[ic-payouts] No email found for user ${payload.userId}; skipping invoice.cancelled notification`,
        )
        return
      }

      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: [recipient],
        subject: `[IC Payout] Claim cancelled by admin`,
        html: `
          <p>Your commission claim has been cancelled by an administrator.</p>
          <p>
            <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
            <strong>Reason:</strong> ${payload.reason}
          </p>
          <p>Any eligible items and adjustments have been returned to your queue so you can resubmit. Please contact your agency administrator if you have questions.</p>
        `,
        text: `Your commission claim has been cancelled by an administrator. Invoice ${payload.invoiceId}. Reason: ${payload.reason}. Eligible items and adjustments have been returned to your queue so you can resubmit.`,
        templateSlug: 'ic-payout.invoice.cancelled',
      })

      this.logger.log(
        `[ic-payouts] Cancellation notification sent for invoice ${payload.invoiceId} to ${recipient}`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send invoice.cancelled notification for ${payload.invoiceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // disbursement.awaiting-manual-send → admin email (with rail + mask)
  // ===========================================================================

  @OnEvent('ic-payout.disbursement.awaiting-manual-send')
  async onDisbursementAwaitingManualSend(payload: DisbursementAwaitingManualSendEvent): Promise<void> {
    try {
      const recipients = await this.getAdminEmails(payload.agencyId)
      if (recipients.length === 0) {
        this.logger.warn(
          `[ic-payouts] No admin recipients for agency ${payload.agencyId}; skipping disbursement.awaiting-manual-send email`,
        )
        return
      }

      const amount = this.formatAmount(payload.currency, payload.amountCents)
      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: recipients,
        subject: `[IC Payout] Manual disbursement awaiting action (${amount})`,
        html: `
          <p>A disbursement is awaiting manual send. Please action it in the admin panel.</p>
          <p>
            <strong>Disbursement ID:</strong> ${payload.disbursementId}<br>
            <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
            <strong>Amount:</strong> ${amount}<br>
            <strong>Rail:</strong> ${payload.rail}<br>
            <strong>Destination:</strong> ${payload.mask}
          </p>
          <p><a href="${this.adminDisbursementUrl(payload.disbursementId)}">Review in admin</a></p>
        `,
        text: `A disbursement is awaiting manual send. Disbursement ${payload.disbursementId} — ${amount} via ${payload.rail} to ${payload.mask}. Review at ${this.adminDisbursementUrl(payload.disbursementId)}`,
        templateSlug: 'ic-payout.disbursement.awaiting-manual-send',
      })

      this.logger.log(
        `[ic-payouts] Awaiting-manual-send notification sent for disbursement ${payload.disbursementId} to ${recipients.length} admin(s)`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send disbursement.awaiting-manual-send notification for ${payload.disbursementId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // disbursement.sent → IC email (with reference)
  // ===========================================================================

  @OnEvent('ic-payout.disbursement.sent')
  async onDisbursementSent(payload: DisbursementSentEvent): Promise<void> {
    try {
      const recipient = await this.getUserEmail(payload.userId)
      if (!recipient) {
        this.logger.warn(
          `[ic-payouts] No email found for user ${payload.userId}; skipping disbursement.sent notification`,
        )
        return
      }

      const amount = this.formatAmount(payload.currency, payload.amountCents)
      const completedDate = payload.completedAt.toISOString().slice(0, 10)
      await this.email.sendEmail({
        agencyId: payload.agencyId,
        to: [recipient],
        subject: `[IC Payout] Your payment has been sent`,
        html: `
          <p>Your commission payment has been sent.</p>
          <p>
            <strong>Disbursement ID:</strong> ${payload.disbursementId}<br>
            <strong>Amount:</strong> ${amount}<br>
            <strong>Reference:</strong> ${payload.reference}<br>
            <strong>Date:</strong> ${completedDate}
          </p>
          <p>Please allow 1–3 business days for funds to arrive in your account.</p>
        `,
        text: `Your commission payment has been sent. Disbursement ${payload.disbursementId} — ${amount}. Reference: ${payload.reference}. Date: ${completedDate}.`,
        templateSlug: 'ic-payout.disbursement.sent',
      })

      this.logger.log(
        `[ic-payouts] Sent notification delivered for disbursement ${payload.disbursementId} to ${recipient}`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send disbursement.sent notification for ${payload.disbursementId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // disbursement.failed → both IC + admin (two sendEmail calls)
  // ===========================================================================

  @OnEvent('ic-payout.disbursement.failed')
  async onDisbursementFailed(payload: DisbursementFailedEvent): Promise<void> {
    try {
      const amount = this.formatAmount(payload.currency, payload.amountCents)

      // 1. IC notification
      const icRecipient = await this.getUserEmail(payload.userId)
      if (icRecipient) {
        await this.email.sendEmail({
          agencyId: payload.agencyId,
          to: [icRecipient],
          subject: `[IC Payout] Your payment could not be sent`,
          html: `
            <p>Unfortunately, your commission payment could not be sent.</p>
            <p>
              <strong>Disbursement ID:</strong> ${payload.disbursementId}<br>
              <strong>Amount:</strong> ${amount}<br>
              <strong>Reason:</strong> ${payload.reason}
            </p>
            <p>Your agency administrator has been notified. Please contact them for next steps.</p>
          `,
          text: `Your commission payment could not be sent. Disbursement ${payload.disbursementId} — ${amount}. Reason: ${payload.reason}. Your agency administrator has been notified.`,
          templateSlug: 'ic-payout.disbursement.failed-ic',
        })
      } else {
        this.logger.warn(
          `[ic-payouts] No email found for user ${payload.userId}; skipping disbursement.failed IC notification`,
        )
      }

      // 2. Admin notification
      const adminRecipients = await this.getAdminEmails(payload.agencyId)
      if (adminRecipients.length > 0) {
        await this.email.sendEmail({
          agencyId: payload.agencyId,
          to: adminRecipients,
          subject: `[IC Payout] Disbursement failed — action required`,
          html: `
            <p>A disbursement has failed and requires your attention.</p>
            <p>
              <strong>Disbursement ID:</strong> ${payload.disbursementId}<br>
              <strong>Invoice ID:</strong> ${payload.invoiceId}<br>
              <strong>Amount:</strong> ${amount}<br>
              <strong>Reason:</strong> ${payload.reason}<br>
              <strong>Failed by:</strong> ${payload.failedBy}
            </p>
            <p>The invoice reservation has been reversed. Please review and take corrective action.</p>
            <p><a href="${this.adminDisbursementUrl(payload.disbursementId)}">Review in admin</a></p>
          `,
          text: `A disbursement has failed. Disbursement ${payload.disbursementId} — ${amount}. Reason: ${payload.reason}. The invoice reservation has been reversed. Review at ${this.adminDisbursementUrl(payload.disbursementId)}`,
          templateSlug: 'ic-payout.disbursement.failed-admin',
        })
      } else {
        this.logger.warn(
          `[ic-payouts] No admin recipients for agency ${payload.agencyId}; skipping disbursement.failed admin notification`,
        )
      }

      this.logger.log(
        `[ic-payouts] Failed-disbursement notifications sent for ${payload.disbursementId} (IC: ${icRecipient ?? 'none'}, admins: ${adminRecipients.length})`,
      )
    } catch (err) {
      this.logger.error(
        `[ic-payouts] Failed to send disbursement.failed notifications for ${payload.disbursementId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // ===========================================================================
  // disbursement.returned → no-op placeholder (Phase 2 v2 webhook only)
  // ===========================================================================

  @OnEvent('ic-payout.disbursement.returned')
  onDisbursementReturned(payload: DisbursementReturnedEvent): void {
    // TODO(Phase 2): Wire returned-disbursement notifications when v2 webhook provider
    // emits returned events. Phase 1 ManualPayoutProvider never fires this event.
    this.logger.log(
      `[ic-payouts] disbursement.returned received for disbursement ${payload.disbursementId} — no-op in Phase 1`,
    )
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async getAdminEmails(agencyId: string): Promise<string[]> {
    const rows = await this.db.client
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.agencyId, agencyId),
          inArray(userProfiles.role, ['admin']),
        ),
      )
    return rows.map((r) => r.email).filter((e): e is string => !!e)
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    const [row] = await this.db.client
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, userId))
      .limit(1)
    return row?.email ?? null
  }

  private formatAmount(currency: string, cents: number): string {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }

  /**
   * Email recipients open links from a mail client, not the admin app, so
   * relative URLs resolve against the mail-client origin (and Gmail will even
   * coerce a bare leading slash into `http://commission/...` — confirmed in
   * the wild). All notification links MUST be absolute. ADMIN_URL is in
   * Doppler for every environment (dev/stg/prd); fall back to '' so the link
   * fails fast in misconfigured environments instead of mailing a broken URL.
   */
  private absoluteAdminUrl(path: string): string {
    const base = (process.env.ADMIN_URL ?? '').replace(/\/+$/, '')
    return `${base}${path}`
  }

  private adminInvoiceUrl(invoiceId: string): string {
    return this.absoluteAdminUrl(`/commission/disbursements?invoiceId=${invoiceId}`)
  }

  private adminDisbursementUrl(disbursementId: string): string {
    return this.absoluteAdminUrl(`/commission/disbursements/${disbursementId}`)
  }
}
