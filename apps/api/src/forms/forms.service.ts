/**
 * Forms Service
 *
 * Token-based public form system for insurance waivers, intake forms, etc.
 * Generates secure tokens that allow unauthenticated access to specific forms.
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { DatabaseService } from '../db/database.service'
import { DocumentTemplatesService } from '../document-templates/document-templates.service'
import { PuppeteerPdfService } from '../document-render/puppeteer-pdf.service'
import { EmailService } from '../email/email.service'

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly documentTemplatesService: DocumentTemplatesService,
    private readonly puppeteerPdfService: PuppeteerPdfService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a secure form token for public access
   */
  async createToken(params: {
    formType: string
    tripId?: string
    travelerIds?: string[]
    agencyId: string
    contextData?: Record<string, unknown>
    expiresInDays?: number
  }) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 30))

    const rows = await this.db.client
      .insert(this.db.schema.formTokens)
      .values({
        token,
        formType: params.formType,
        tripId: params.tripId,
        travelerIds: params.travelerIds,
        agencyId: params.agencyId,
        contextData: params.contextData,
        expiresAt,
      })
      .returning()

    const row = rows[0]!

    this.logger.log(`Created form token for ${params.formType} (trip: ${params.tripId ?? 'none'})`)

    return { id: row.id, token }
  }

  /**
   * Resolve and validate a form token
   * Throws if token is invalid, expired, or already completed
   */
  async resolveToken(token: string) {
    const [row] = await this.db.client
      .select()
      .from(this.db.schema.formTokens)
      .where(eq(this.db.schema.formTokens.token, token))
      .limit(1)

    if (!row) throw new NotFoundException('Form not found')
    if (row.completedAt) throw new BadRequestException('This form has already been submitted')
    if (new Date() > new Date(row.expiresAt)) throw new BadRequestException('This form has expired')

    return row
  }

  /**
   * Resolve a form token and load the matching document template (if any).
   * The template provides customizable form_json fields and email_html.
   */
  async resolveTokenWithTemplate(token: string) {
    const form = await this.resolveToken(token)

    // Map form types to document template slugs
    let template = null
    const templateSlugMap: Record<string, string> = {
      'insurance_waiver': 'insurance-waiver-form',
      'client_intake': 'client-intake-form',
    }

    const templateSlug = templateSlugMap[form.formType]
    if (templateSlug && form.agencyId) {
      try {
        template = await this.documentTemplatesService.resolvePublishedTemplate(
          templateSlug,
          form.agencyId,
        )
      } catch {
        // Template not found — form will use hardcoded fallback
        this.logger.warn(`Template "${templateSlug}" not found for agency ${form.agencyId}, using defaults`)
      }
    }

    return {
      ...form,
      template: template
        ? {
            formJson: template.formJson,
            emailHtml: template.emailHtml,
            name: template.name,
            variables: template.variables,
          }
        : null,
    }
  }

  /**
   * Mark a form token as completed
   */
  async markCompleted(token: string) {
    await this.db.client
      .update(this.db.schema.formTokens)
      .set({ completedAt: new Date() })
      .where(eq(this.db.schema.formTokens.token, token))
  }

  /**
   * Handle insurance waiver form submission
   * Updates trip_traveler_insurance for each traveler decision,
   * generates a signed waiver PDF (decline only), emails it, and returns it.
   */
  async handleInsuranceWaiverSubmission(
    form: {
      id: string
      tripId: string | null
      travelerIds: string[] | null
      agencyId: string
      contextData: Record<string, unknown> | null
    },
    body: Record<string, unknown>,
    ipAddress: string,
  ) {
    const decisions = body.decisions as Array<{
      travelerId: string
      action: 'purchase' | 'decline'
      packageId?: string
      reason?: string
    }>

    const signature = body.signature as {
      fullName: string
      date: string
    } | undefined

    if (!Array.isArray(decisions) || decisions.length === 0) {
      throw new BadRequestException('decisions array is required')
    }

    if (!form.tripId) {
      throw new BadRequestException('Form is not associated with a trip')
    }

    const { tripTravelerInsurance } = this.db.schema
    const now = new Date()
    const isDecline = decisions[0]?.action === 'decline'

    // If declining, signature is required
    if (isDecline && (!signature?.fullName || signature.fullName.trim().length < 2)) {
      throw new BadRequestException('A valid signature is required when declining insurance')
    }

    for (const decision of decisions) {
      if (decision.action === 'purchase') {
        if (!decision.packageId) {
          throw new BadRequestException(`packageId is required when action is 'purchase' for traveler ${decision.travelerId}`)
        }

        // Upsert: update if exists, otherwise insert
        const [existing] = await this.db.client
          .select({ id: tripTravelerInsurance.id })
          .from(tripTravelerInsurance)
          .where(
            and(
              eq(tripTravelerInsurance.tripId, form.tripId),
              eq(tripTravelerInsurance.tripTravelerId, decision.travelerId),
            ),
          )
          .limit(1)

        if (existing) {
          await this.db.client
            .update(tripTravelerInsurance)
            .set({
              status: 'selected_package',
              selectedPackageId: decision.packageId,
              updatedAt: now,
            })
            .where(eq(tripTravelerInsurance.id, existing.id))
        } else {
          await this.db.client
            .insert(tripTravelerInsurance)
            .values({
              tripId: form.tripId,
              tripTravelerId: decision.travelerId,
              status: 'selected_package',
              selectedPackageId: decision.packageId,
            })
        }

        this.logger.log(`Traveler ${decision.travelerId} selected package ${decision.packageId}`)
      } else if (decision.action === 'decline') {
        const [existing] = await this.db.client
          .select({ id: tripTravelerInsurance.id })
          .from(tripTravelerInsurance)
          .where(
            and(
              eq(tripTravelerInsurance.tripId, form.tripId),
              eq(tripTravelerInsurance.tripTravelerId, decision.travelerId),
            ),
          )
          .limit(1)

        if (existing) {
          await this.db.client
            .update(tripTravelerInsurance)
            .set({
              status: 'declined',
              declinedAt: now,
              acknowledgedAt: now,
              declinedReason: decision.reason ?? null,
              updatedAt: now,
            })
            .where(eq(tripTravelerInsurance.id, existing.id))
        } else {
          await this.db.client
            .insert(tripTravelerInsurance)
            .values({
              tripId: form.tripId,
              tripTravelerId: decision.travelerId,
              status: 'declined',
              declinedAt: now,
              acknowledgedAt: now,
              declinedReason: decision.reason ?? null,
            })
        }

        this.logger.log(`Traveler ${decision.travelerId} declined insurance${decision.reason ? `: ${decision.reason}` : ''}`)
      }
    }

    // Generate reference number from form ID
    const referenceNumber = `TF-${now.getFullYear()}-${form.id.slice(0, 5).toUpperCase()}`

    // For purchase decisions, return a simple success
    if (!isDecline) {
      return {
        success: true,
        referenceNumber,
        signedAt: now.toISOString(),
        pdfBase64: null,
        travelerEmail: null,
      }
    }

    // ── Decline path: generate signed waiver PDF and email it ──

    // Resolve agency name
    const agencyName = await this.resolveAgencyName(form.agencyId)

    // Resolve traveler email (from the first traveler's contact record)
    const travelerEmail = await this.resolveTravelerEmail(decisions[0]!.travelerId)

    // Get trip details from contextData
    const ctx = form.contextData ?? {}
    const tripName = (ctx.tripName as string) ?? 'Trip'
    const tripStartDate = (ctx.tripStartDate as string) ?? null
    const tripEndDate = (ctx.tripEndDate as string) ?? null
    const recipientName = (ctx.recipientName as string) ?? ''
    const dependentNames = (ctx.dependentNames as string[]) ?? []
    const travelerNames = [
      ...(recipientName ? [recipientName] : []),
      ...dependentNames,
    ]

    // Build the signed waiver HTML
    const waiverHtml = this.buildSignedWaiverHtml({
      agencyName,
      tripName,
      tripStartDate,
      tripEndDate,
      travelerNames,
      signatureName: signature!.fullName.trim(),
      signatureDate: now,
      ipAddress,
      referenceNumber,
    })

    // Render to PDF via Puppeteer
    let pdfBase64: string | null = null
    try {
      const pdfBuffer = await this.puppeteerPdfService.renderHtmlToPdf(waiverHtml)
      pdfBase64 = pdfBuffer.toString('base64')

      this.logger.log(`Generated signed waiver PDF for ${referenceNumber}`)

      // Email the PDF to the traveler
      if (travelerEmail) {
        try {
          await this.emailService.sendEmail({
            to: [travelerEmail],
            subject: `Insurance Waiver \u2014 ${tripName}`,
            html: this.buildWaiverEmailHtml(agencyName, tripName, referenceNumber),
            attachments: [
              {
                filename: `insurance-waiver-${referenceNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ],
            agencyId: form.agencyId,
            tripId: form.tripId ?? undefined,
            templateSlug: 'insurance-waiver-signed',
          })
          this.logger.log(`Sent signed waiver email to ${travelerEmail} for ${referenceNumber}`)
        } catch (emailError: any) {
          this.logger.error(`Failed to send waiver email for ${referenceNumber}: ${emailError.message}`)
          // Don't fail the submission if email fails
        }
      }
    } catch (pdfError: any) {
      this.logger.error(`Failed to generate waiver PDF for ${referenceNumber}: ${pdfError.message}`)
      // Don't fail the submission if PDF generation fails
    }

    return {
      success: true,
      referenceNumber,
      signedAt: now.toISOString(),
      pdfBase64,
      travelerEmail,
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve agency name from the agencies table
   */
  private async resolveAgencyName(agencyId: string): Promise<string> {
    try {
      const [agency] = await this.db.client
        .select({ name: this.db.schema.agencies.name })
        .from(this.db.schema.agencies)
        .where(eq(this.db.schema.agencies.id, agencyId))
        .limit(1)
      return agency?.name ?? 'Phoenix Voyages'
    } catch {
      return 'Phoenix Voyages'
    }
  }

  /**
   * Resolve the primary traveler's email from trip_travelers -> contacts
   */
  private async resolveTravelerEmail(tripTravelerId: string): Promise<string | null> {
    try {
      const [result] = await this.db.client
        .select({ email: this.db.schema.contacts.email })
        .from(this.db.schema.tripTravelers)
        .innerJoin(
          this.db.schema.contacts,
          eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id),
        )
        .where(eq(this.db.schema.tripTravelers.id, tripTravelerId))
        .limit(1)
      return result?.email ?? null
    } catch {
      return null
    }
  }

  /**
   * Build a complete HTML document for the signed waiver PDF
   */
  private buildSignedWaiverHtml(params: {
    agencyName: string
    tripName: string
    tripStartDate: string | null
    tripEndDate: string | null
    travelerNames: string[]
    signatureName: string
    signatureDate: Date
    ipAddress: string
    referenceNumber: string
  }): string {
    const {
      agencyName,
      tripName,
      tripStartDate,
      tripEndDate,
      travelerNames,
      signatureName,
      signatureDate,
      ipAddress,
      referenceNumber,
    } = params

    const formatPdfDate = (dateStr: string | null) => {
      if (!dateStr) return null
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }

    const formattedSignatureDate = signatureDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const formattedSignatureTime = signatureDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })

    const start = formatPdfDate(tripStartDate)
    const end = formatPdfDate(tripEndDate)
    const travelDates = start && end ? `${start} \u2013 ${end}` : start || end || 'N/A'

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 0;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #c59746;
    }
    .agency-name {
      font-size: 10pt;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #c59746;
      margin-bottom: 12px;
    }
    .title {
      font-size: 16pt;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .reference {
      font-size: 9pt;
      color: #666;
      font-family: 'Courier New', monospace;
    }
    .details-table {
      width: 100%;
      margin: 16px 0 24px 0;
      border-collapse: collapse;
    }
    .details-table td {
      padding: 6px 12px;
      font-size: 10pt;
      border-bottom: 1px solid #eee;
    }
    .details-table td:first-child {
      color: #666;
      width: 140px;
      font-weight: normal;
    }
    .details-table td:last-child {
      color: #1a1a1a;
      font-weight: 500;
    }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 28px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid #ddd;
    }
    .decision-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 12px 0;
      font-weight: bold;
      color: #991b1b;
    }
    .waiver-text {
      margin: 12px 0;
    }
    .waiver-text p {
      margin-bottom: 8px;
    }
    .waiver-text ul {
      margin: 8px 0 8px 24px;
    }
    .waiver-text li {
      margin-bottom: 6px;
    }
    .signature-block {
      margin: 28px 0 16px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 20px;
      background: #fafafa;
    }
    .signature-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .signature-label {
      font-size: 9pt;
      color: #666;
      width: 120px;
    }
    .signature-value {
      font-size: 12pt;
      font-weight: bold;
      color: #1a1a1a;
      flex: 1;
      border-bottom: 1px solid #999;
      padding-bottom: 2px;
      margin-left: 8px;
    }
    .signature-meta {
      font-size: 8pt;
      color: #999;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #eee;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 8pt;
      color: #999;
    }
    .footer p {
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="agency-name">${this.escapeHtml(agencyName)}</div>
    <div class="title">Travel Insurance Waiver & Acknowledgment</div>
    <div class="reference">${this.escapeHtml(referenceNumber)}</div>
  </div>

  <table class="details-table">
    <tr>
      <td>Date</td>
      <td>${formattedSignatureDate}</td>
    </tr>
    <tr>
      <td>Trip</td>
      <td>${this.escapeHtml(tripName)}</td>
    </tr>
    <tr>
      <td>Travel Dates</td>
      <td>${travelDates}</td>
    </tr>
    <tr>
      <td>Traveler${travelerNames.length > 1 ? 's' : ''}</td>
      <td>${travelerNames.map((n) => this.escapeHtml(n)).join(', ')}</td>
    </tr>
  </table>

  <div class="section-title">Section 1: Insurance Coverage Decision</div>
  <div class="decision-box">
    Insurance coverage has been DECLINED
  </div>

  <div class="section-title">Section 2: Acknowledgment & Waiver</div>
  <div class="waiver-text">
    <p>I, the undersigned, acknowledge that:</p>
    <ul>
      <li>Travel insurance has been offered to me by <strong>${this.escapeHtml(agencyName)}</strong>.</li>
      <li>I understand the risks of travelling without insurance including but not limited to medical emergencies, trip cancellation, lost baggage, and travel delays.</li>
      <li>I voluntarily decline insurance coverage and assume all financial responsibility for any losses or expenses incurred.</li>
      <li>I release ${this.escapeHtml(agencyName)} and its agents from any liability arising from my decision to decline coverage.</li>
    </ul>
  </div>

  <div class="section-title">Section 3: Digital Signature</div>
  <div class="signature-block">
    <div class="signature-line">
      <span class="signature-label">Full Legal Name:</span>
      <span class="signature-value">${this.escapeHtml(signatureName)}</span>
    </div>
    <div class="signature-line">
      <span class="signature-label">Date:</span>
      <span class="signature-value" style="font-size: 10pt; font-weight: normal;">${formattedSignatureDate} at ${formattedSignatureTime}</span>
    </div>
    <div class="signature-meta">
      This document was electronically signed via Tailfire.<br>
      IP Address: ${this.escapeHtml(ipAddress)}
    </div>
  </div>

  <div class="footer">
    <p>This document was generated by Tailfire on behalf of ${this.escapeHtml(agencyName)}.</p>
    <p>Document Reference: ${this.escapeHtml(referenceNumber)}</p>
  </div>
</body>
</html>`
  }

  /**
   * Build the email HTML body for the signed waiver notification
   */
  private buildWaiverEmailHtml(
    agencyName: string,
    tripName: string,
    referenceNumber: string,
  ): string {
    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Insurance Waiver Signed</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${this.escapeHtml(tripName)}</p>
  </div>
  <div style="padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px 0; color: #333;">Your signed insurance waiver is attached to this email as a PDF document.</p>
    <div style="background: white; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
      <p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">Reference Number</p>
      <p style="margin: 0; font-family: 'Courier New', monospace; font-weight: bold; color: #333;">${this.escapeHtml(referenceNumber)}</p>
    </div>
    <p style="margin: 0; font-size: 13px; color: #666;">
      Please retain this document for your records. If you have any questions, please contact your travel advisor at ${this.escapeHtml(agencyName)}.
    </p>
  </div>
</div>`
  }

  /**
   * Escape HTML special characters to prevent XSS in generated documents
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}
