/**
 * Trip-Order PDF Generation Service
 *
 * Generates professional Trip-Order documents using the document template system
 * (Handlebars HTML rendering + Puppeteer PDF conversion):
 * - Phoenix Voyages branding (Cinzel/Lato fonts, gold colors)
 * - Trip header with agency branding
 * - Trip summary and dates
 * - Activities with costs
 * - Per-traveller cost breakdown
 * - Payment terms and compliance text
 *
 * Also supports sending Trip Order PDFs via email with attachments.
 */

import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common'
import { eq, and, desc, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { FinancialSummaryService } from './financial-summary.service'
import { EmailService } from '../email/email.service'
import { EmailTemplatesService } from '../email/email-templates.service'
import { DocumentTemplatesService } from '../document-templates/document-templates.service'
import { HandlebarsRendererService } from '../document-templates/handlebars-renderer.service'
import { PuppeteerPdfService } from '../document-render/puppeteer-pdf.service'
import type {
  TICOTripOrder,
  BusinessConfiguration,
  TripOrderPaymentSummary,
  TripOrderBookingDetail,
  TripOrderPaymentScheduleSummary,
  CostBreakdown,
} from './pdf/types'
import type {
  GenerateTripOrderDto,
  TripOrderResponseDto,
  TripFinancialSummaryResponseDto,
} from '@tailfire/shared-types'

interface SendTripOrderEmailOptions {
  to?: string[]
  includePrimaryContact?: boolean
  includePassengers?: boolean
  includeAgent?: boolean
  cc?: string[]
  message?: string
}

interface EmailSendResult {
  success: boolean
  emailLogId?: string
  providerMessageId?: string
  recipients: string[]
  error?: string
}

// Trip Order Snapshot DTO
export interface TripOrderSnapshotDto {
  id: string
  tripId: string
  agencyId: string
  versionNumber: number
  orderData: unknown
  paymentSummary: unknown
  bookingDetails: unknown
  businessConfig: unknown
  status: 'draft' | 'finalized' | 'sent'
  createdAt: string
  finalizedAt?: string
  sentAt?: string
  createdBy?: string
  finalizedBy?: string
  sentBy?: string
  emailLogId?: string
}

@Injectable()
export class TripOrderService {
  private readonly logger = new Logger(TripOrderService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly financialSummaryService: FinancialSummaryService,
    @Inject(forwardRef(() => EmailService))
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => EmailTemplatesService))
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly templatesService: DocumentTemplatesService,
    private readonly handlebars: HandlebarsRendererService,
    private readonly puppeteerPdf: PuppeteerPdfService,
  ) {}

  /**
   * Generate a Trip-Order PDF document using the document template system
   * (Handlebars HTML + Puppeteer PDF)
   */
  async generateTripOrder(tripId: string, agencyId: string, _dto: GenerateTripOrderDto = {}): Promise<Buffer> {
    // Get trip details
    const trip = await this.getTripDetails(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Get agency settings for branding
    const businessConfig = await this.getBusinessConfiguration(agencyId)

    // Get financial summary
    const financialSummary = await this.financialSummaryService.getTripFinancialSummary(tripId)

    // Get passengers
    const passengers = await this.getTripPassengers(tripId)

    // Get primary contact
    const primaryContact = await this.getPrimaryContact(tripId)

    // Get trip agent
    const agent = await this.getTripAgent(tripId)

    // Get bookings
    const bookings = await this.getTripBookings(tripId)

    // Get payments and schedule
    const payments = await this.getTripPayments(tripId)
    const paymentScheduleInfo = await this.getTripPaymentScheduleInfo(tripId)

    // Build payment summary with schedule
    const paymentSummary = {
      ...this.buildPaymentSummary(payments, financialSummary.grandTotal.totalCostCents / 100),
      payment_schedule: paymentScheduleInfo,
    }

    // Build Handlebars template context
    const context = this.buildTemplateContext({
      trip,
      businessConfig,
      financialSummary,
      passengers,
      primaryContact,
      agent,
      bookings,
      paymentSummary,
    })

    // Render via document template system
    return this.renderTripOrderPdf(agencyId, context)
  }

  /**
   * Generate Trip-Order and return URL (data URL for now)
   */
  async generateTripOrderWithUrl(
    tripId: string,
    agencyId: string,
    dto: GenerateTripOrderDto = {}
  ): Promise<TripOrderResponseDto> {
    const pdfBuffer = await this.generateTripOrder(tripId, agencyId, dto)

    // Return a data URL (in production, this would upload to Supabase Storage)
    const base64 = pdfBuffer.toString('base64')
    const dataUrl = `data:application/pdf;base64,${base64}`

    const trip = await this.getTripDetails(tripId)
    const filename = `trip-order-${trip?.name?.replace(/[^a-zA-Z0-9]/g, '-') ?? tripId}.pdf`

    return {
      pdfUrl: dataUrl,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour expiry
      filename,
    }
  }

  /**
   * Send Trip Order PDF via email
   */
  async sendTripOrderEmail(
    tripId: string,
    agencyId: string,
    options: SendTripOrderEmailOptions
  ): Promise<EmailSendResult> {
    this.logger.log(`Sending trip order email for trip ${tripId}`)

    // 1. Generate PDF with professional design
    const pdfBuffer = await this.generateTripOrder(tripId, agencyId)

    // 2. Build recipient list
    const recipients = await this.buildRecipientList(tripId, options)

    if (recipients.to.length === 0) {
      return {
        success: false,
        recipients: [],
        error: 'No valid recipients found',
      }
    }

    // 3. Get trip data for template variables
    const trip = await this.getTripDetails(tripId)
    const primaryContact = await this.getPrimaryContact(tripId)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // 4. Render email template (with fallback for missing template)
    let rendered: { subject: string; html: string; text?: string }
    try {
      rendered = await this.emailTemplatesService.renderTemplate('trip-order-pdf', {
        agencyId,
        tripId,
        contactId: primaryContact?.id,
      })
    } catch (error) {
      // Fallback template when database template doesn't exist
      this.logger.warn('Email template "trip-order-pdf" not found, using fallback template')
      const contactName = primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() : 'Valued Customer'
      const businessConfig = await this.getBusinessConfiguration(agencyId)
      rendered = {
        subject: `Your Trip Order - ${trip.name}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Your Trip Order</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${trip.name}</p>
  </div>

  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${contactName},</p>

    <p>Please find attached your Trip Order document with complete details of your upcoming travel.</p>

    <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
      <h2 style="color: #c59746; margin-top: 0; font-size: 18px;">Trip Details</h2>
      <p><strong>Trip:</strong> ${trip.name}</p>
      ${trip.startDate ? `<p><strong>Dates:</strong> ${trip.startDate}${trip.endDate ? ` - ${trip.endDate}` : ''}</p>` : ''}
      ${trip.reference ? `<p><strong>Reference:</strong> ${trip.reference}</p>` : ''}
    </div>

    <p>The attached PDF contains your complete Trip Order including:</p>
    <ul style="color: #4b5563;">
      <li>Service details and itinerary</li>
      <li>Financial summary and payment information</li>
      <li>Important disclosures and terms</li>
    </ul>

    <p>If you have any questions, please don't hesitate to contact us.</p>

    <p>Best regards,<br>
    <strong style="color: #c59746;">${businessConfig.company_name}</strong></p>
  </div>

  <div style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
    <p>${businessConfig.company_name}${businessConfig.phone ? ` | ${businessConfig.phone}` : ''}${businessConfig.email ? ` | ${businessConfig.email}` : ''}</p>
    ${businessConfig.tico_registration ? `<p>TICO Registration: ${businessConfig.tico_registration}</p>` : ''}
  </div>
</body>
</html>`,
        text: `Your Trip Order - ${trip.name}\n\nDear ${contactName},\n\nPlease find attached your Trip Order document.\n\nTrip: ${trip.name}\n${trip.reference ? `Reference: ${trip.reference}\n` : ''}\n\nBest regards,\n${businessConfig.company_name}`,
      }
    }

    // 5. Send email with PDF attachment
    const result = await this.emailService.sendEmailWithAttachments({
      to: recipients.to,
      cc: recipients.cc,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        {
          filename: `TripOrder-${trip.reference || trip.name?.replace(/[^a-zA-Z0-9]/g, '-') || tripId.slice(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      agencyId,
      tripId,
      contactId: primaryContact?.id,
      templateSlug: 'trip-order-pdf',
    })

    return {
      success: result.success,
      emailLogId: result.emailLogId,
      providerMessageId: result.providerMessageId,
      recipients: [...recipients.to, ...recipients.cc],
      error: result.error,
    }
  }

  // ============================================================================
  // TRIP ORDER SNAPSHOT METHODS (JSON Storage with Versioning)
  // ============================================================================

  /**
   * Generate a new Trip Order snapshot and store it in the database
   * Automatically increments the version number for the trip
   */
  async generateTripOrderSnapshot(
    tripId: string,
    agencyId: string,
    userId?: string
  ): Promise<TripOrderSnapshotDto> {
    this.logger.log(`Generating trip order snapshot for trip ${tripId}`)

    // Get trip details
    const trip = await this.getTripDetails(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Build all the data using existing methods
    const businessConfig = await this.getBusinessConfiguration(agencyId)
    const financialSummary = await this.financialSummaryService.getTripFinancialSummary(tripId)
    const passengers = await this.getTripPassengers(tripId)
    const primaryContact = await this.getPrimaryContact(tripId)
    const agent = await this.getTripAgent(tripId)
    const bookings = await this.getTripBookings(tripId)
    const payments = await this.getTripPayments(tripId)
    const paymentScheduleInfo = await this.getTripPaymentScheduleInfo(tripId)

    // Build data structures
    const orderData = this.buildTripOrderData({
      trip,
      businessConfig,
      financialSummary,
      passengers,
      primaryContact,
      agent,
      bookings,
    })
    const paymentSummary = {
      ...this.buildPaymentSummary(
        payments,
        financialSummary.grandTotal.totalCostCents / 100
      ),
      payment_schedule: paymentScheduleInfo,
    }
    const bookingDetails = this.buildBookingDetails(bookings)

    // Get next version number and insert
    // Note: FOR UPDATE is not compatible with PgBouncer transaction pooling
    // Using optimistic approach with unique constraint (trip_id, version_number)
    const versionResult = await this.db.client.execute(sql`
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM trip_orders
      WHERE trip_id = ${tripId}
    `)
    const nextVersion = (versionResult as any)[0]?.next_version ?? 1

    // Insert the new trip order (unique constraint handles race conditions)
    const [newTripOrder] = await this.db.client
      .insert(this.db.schema.tripOrders)
      .values({
        tripId,
        agencyId,
        versionNumber: nextVersion,
        orderData: orderData as any,
        paymentSummary: paymentSummary as any,
        bookingDetails: bookingDetails as any,
        businessConfig: businessConfig as any,
        status: 'draft',
        createdBy: userId,
      })
      .returning()

    if (!newTripOrder) {
      throw new Error('Failed to create trip order snapshot')
    }

    this.logger.log(`Created trip order snapshot v${newTripOrder.versionNumber} for trip ${tripId}`)

    return this.mapTripOrderToDto(newTripOrder)
  }

  /**
   * List all trip order versions for a trip
   */
  async listTripOrders(tripId: string, agencyId: string): Promise<TripOrderSnapshotDto[]> {
    const tripOrders = await this.db.client
      .select()
      .from(this.db.schema.tripOrders)
      .where(
        and(
          eq(this.db.schema.tripOrders.tripId, tripId),
          eq(this.db.schema.tripOrders.agencyId, agencyId)
        )
      )
      .orderBy(desc(this.db.schema.tripOrders.versionNumber))

    return tripOrders.map((to) => this.mapTripOrderToDto(to))
  }

  /**
   * Get a specific trip order by ID
   */
  async getTripOrderById(id: string, agencyId: string): Promise<TripOrderSnapshotDto> {
    const [tripOrder] = await this.db.client
      .select()
      .from(this.db.schema.tripOrders)
      .where(
        and(
          eq(this.db.schema.tripOrders.id, id),
          eq(this.db.schema.tripOrders.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!tripOrder) {
      throw new NotFoundException(`Trip order ${id} not found`)
    }

    return this.mapTripOrderToDto(tripOrder)
  }

  /**
   * Get the latest trip order for a trip (if exists)
   */
  async getLatestTripOrder(tripId: string, agencyId: string): Promise<TripOrderSnapshotDto | null> {
    const [tripOrder] = await this.db.client
      .select()
      .from(this.db.schema.tripOrders)
      .where(
        and(
          eq(this.db.schema.tripOrders.tripId, tripId),
          eq(this.db.schema.tripOrders.agencyId, agencyId)
        )
      )
      .orderBy(desc(this.db.schema.tripOrders.versionNumber))
      .limit(1)

    if (!tripOrder) {
      return null
    }

    return this.mapTripOrderToDto(tripOrder)
  }

  /**
   * Validate TICO compliance requirements (Ontario Regulation 26/05, Section 38)
   * Returns array of compliance violations — empty means compliant.
   */
  validateTICOCompliance(tripOrder: {
    orderData: unknown
    paymentSummary: unknown
    bookingDetails: unknown
    businessConfig: unknown
  }): string[] {
    const violations: string[] = []
    const orderData = tripOrder.orderData as TICOTripOrder | null
    const businessConfig = tripOrder.businessConfig as BusinessConfiguration | null
    const paymentSummary = tripOrder.paymentSummary as TripOrderPaymentSummary | null
    const bookingDetails = tripOrder.bookingDetails as TripOrderBookingDetail[] | null

    // §38(1) — Customer name and address
    const customer = orderData?.order_header?.customer_info
    if (!customer?.name || customer.name === 'Customer') {
      violations.push('Customer name is required (Reg. 26/05 §38(1))')
    }

    // §38(2) — Date of booking
    if (!orderData?.order_header?.order_date) {
      violations.push('Order date is required (Reg. 26/05 §38(2))')
    }

    // §38(3) — Payment amount and balance owing
    if (paymentSummary == null) {
      violations.push('Payment summary is required (Reg. 26/05 §38(3))')
    }

    // §38(5) — Total price of travel services
    if (!orderData?.cost_breakdown?.final_total && orderData?.cost_breakdown?.final_total !== 0) {
      violations.push('Total price is required (Reg. 26/05 §38(5))')
    }

    // §38(6) — Agency info is built into the template from agency_settings,
    // so we only check that businessConfig was populated at all
    if (!businessConfig) {
      violations.push('Agency configuration is missing — cannot generate compliant invoice')
    }

    // §38(7) — Service description with destination and departure date
    if (!orderData?.service_details?.description) {
      violations.push('Service description is required (Reg. 26/05 §38(7))')
    }
    if (!orderData?.service_details?.travel_dates?.departure) {
      violations.push('Departure date is required (Reg. 26/05 §38(7))')
    }

    // §38(7) — At least one booking/service must be listed
    if (!bookingDetails || bookingDetails.length === 0) {
      violations.push('At least one booking must be included (Reg. 26/05 §38(7))')
    }

    // §38(12) — Travel counsellor name
    if (!orderData?.order_header?.agent_info?.name) {
      violations.push('Travel counsellor name is required (Reg. 26/05 §38(12))')
    }

    // §38 — Compliance statement must be present
    if (!orderData?.compliance_statement) {
      violations.push('TICO compliance statement is required')
    }

    return violations
  }

  /**
   * Finalize a trip order (draft -> finalized)
   * Once finalized, the trip order is locked and cannot be edited.
   * ALL TICO compliance requirements must be satisfied before finalization.
   */
  async finalizeTripOrder(id: string, agencyId: string, userId: string): Promise<TripOrderSnapshotDto> {
    const [tripOrder] = await this.db.client
      .select()
      .from(this.db.schema.tripOrders)
      .where(
        and(
          eq(this.db.schema.tripOrders.id, id),
          eq(this.db.schema.tripOrders.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!tripOrder) {
      throw new NotFoundException(`Trip order ${id} not found`)
    }

    if (tripOrder.status !== 'draft') {
      throw new BadRequestException(`Trip order ${id} is already ${tripOrder.status}`)
    }

    // TICO compliance gate — block finalization if requirements are not met
    const violations = this.validateTICOCompliance(tripOrder)
    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'Trip order cannot be finalized — TICO compliance requirements not met',
        violations,
      })
    }

    const [updated] = await this.db.client
      .update(this.db.schema.tripOrders)
      .set({
        status: 'finalized',
        finalizedAt: new Date(),
        finalizedBy: userId,
      })
      .where(eq(this.db.schema.tripOrders.id, id))
      .returning()

    this.logger.log(`Finalized trip order ${id}`)

    return this.mapTripOrderToDto(updated)
  }

  /**
   * Mark trip order as sent (finalized -> sent)
   * Called after successfully sending the email
   */
  async markTripOrderSent(
    id: string,
    agencyId: string,
    userId: string,
    emailLogId?: string
  ): Promise<TripOrderSnapshotDto> {
    const [tripOrder] = await this.db.client
      .select()
      .from(this.db.schema.tripOrders)
      .where(
        and(
          eq(this.db.schema.tripOrders.id, id),
          eq(this.db.schema.tripOrders.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!tripOrder) {
      throw new NotFoundException(`Trip order ${id} not found`)
    }

    if (tripOrder.status === 'draft') {
      throw new BadRequestException(`Trip order ${id} must be finalized before sending`)
    }

    const [updated] = await this.db.client
      .update(this.db.schema.tripOrders)
      .set({
        status: 'sent',
        sentAt: new Date(),
        sentBy: userId,
        emailLogId,
      })
      .where(eq(this.db.schema.tripOrders.id, id))
      .returning()

    this.logger.log(`Marked trip order ${id} as sent`)

    return this.mapTripOrderToDto(updated)
  }

  /**
   * Generate PDF from a stored trip order snapshot
   */
  async generatePdfFromSnapshot(id: string, agencyId: string): Promise<Buffer> {
    const tripOrder = await this.getTripOrderById(id, agencyId)
    const orderData = tripOrder.orderData as TICOTripOrder
    const businessConfig = tripOrder.businessConfig as BusinessConfiguration
    const paymentSummary = tripOrder.paymentSummary as TripOrderPaymentSummary
    const bookingDetails = tripOrder.bookingDetails as TripOrderBookingDetail[]

    // Build a Handlebars-compatible context from the stored snapshot data
    const context = this.buildSnapshotTemplateContext(
      orderData,
      businessConfig,
      paymentSummary,
      bookingDetails,
    )

    return this.renderTripOrderPdf(agencyId, context)
  }

  /**
   * Send a stored trip order via email
   */
  async sendStoredTripOrderEmail(
    id: string,
    agencyId: string,
    userId: string,
    options: SendTripOrderEmailOptions
  ): Promise<EmailSendResult> {
    // Get the trip order
    const tripOrder = await this.getTripOrderById(id, agencyId)

    // Finalize if still draft
    if (tripOrder.status === 'draft') {
      await this.finalizeTripOrder(id, agencyId, userId)
    }

    // Generate PDF from snapshot
    const pdfBuffer = await this.generatePdfFromSnapshot(id, agencyId)

    // Build recipient list
    const recipients = await this.buildRecipientList(tripOrder.tripId, options)

    if (recipients.to.length === 0) {
      return {
        success: false,
        recipients: [],
        error: 'No valid recipients found',
      }
    }

    // Get trip name for email
    const trip = await this.getTripDetails(tripOrder.tripId)
    const primaryContact = await this.getPrimaryContact(tripOrder.tripId)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripOrder.tripId} not found`)
    }

    // Render email template
    let rendered: { subject: string; html: string; text?: string }
    try {
      rendered = await this.emailTemplatesService.renderTemplate('trip-order-pdf', {
        agencyId,
        tripId: tripOrder.tripId,
        contactId: primaryContact?.id,
      })
    } catch {
      // Fallback template
      const contactName = primaryContact
        ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim()
        : 'Valued Customer'
      const businessConfig = tripOrder.businessConfig as BusinessConfiguration
      rendered = {
        subject: `Your Trip Order - ${trip.name} (v${tripOrder.versionNumber})`,
        html: this.buildFallbackEmailHtml(trip, contactName, businessConfig),
        text: `Your Trip Order - ${trip.name}\n\nPlease find attached your Trip Order document (Version ${tripOrder.versionNumber}).`,
      }
    }

    // Send email
    const result = await this.emailService.sendEmailWithAttachments({
      to: recipients.to,
      cc: recipients.cc,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        {
          filename: `TripOrder-${trip.reference || trip.name?.replace(/[^a-zA-Z0-9]/g, '-') || tripOrder.tripId.slice(0, 8)}-v${tripOrder.versionNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      agencyId,
      tripId: tripOrder.tripId,
      contactId: primaryContact?.id,
      templateSlug: 'trip-order-pdf',
    })

    // Mark as sent if successful
    if (result.success) {
      await this.markTripOrderSent(id, agencyId, userId, result.emailLogId)
    }

    return {
      success: result.success,
      emailLogId: result.emailLogId,
      providerMessageId: result.providerMessageId,
      recipients: [...recipients.to, ...recipients.cc],
      error: result.error,
    }
  }

  /**
   * Helper to build fallback email HTML
   */
  private buildFallbackEmailHtml(
    trip: { name: string; startDate: string | null; endDate: string | null; reference: string | null },
    contactName: string,
    businessConfig: BusinessConfiguration
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #c59746 0%, #e89e4a 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Your Trip Order</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${trip.name}</p>
  </div>
  <div style="padding: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear ${contactName},</p>
    <p>Please find attached your Trip Order document with complete details of your upcoming travel.</p>
    <p>Best regards,<br><strong style="color: #c59746;">${businessConfig.company_name}</strong></p>
  </div>
</body>
</html>`
  }

  /**
   * Map database entity to DTO
   */
  private mapTripOrderToDto(tripOrder: any): TripOrderSnapshotDto {
    return {
      id: tripOrder.id,
      tripId: tripOrder.tripId,
      agencyId: tripOrder.agencyId,
      versionNumber: tripOrder.versionNumber,
      orderData: tripOrder.orderData,
      paymentSummary: tripOrder.paymentSummary,
      bookingDetails: tripOrder.bookingDetails,
      businessConfig: tripOrder.businessConfig,
      status: tripOrder.status,
      createdAt: tripOrder.createdAt?.toISOString(),
      finalizedAt: tripOrder.finalizedAt?.toISOString(),
      sentAt: tripOrder.sentAt?.toISOString(),
      createdBy: tripOrder.createdBy,
      finalizedBy: tripOrder.finalizedBy,
      sentBy: tripOrder.sentBy,
      emailLogId: tripOrder.emailLogId,
    }
  }

  // ============================================================================
  // PRIVATE METHODS - Template Rendering
  // ============================================================================

  /**
   * Resolve the trip-order template, render Handlebars, and convert to PDF.
   */
  private async renderTripOrderPdf(
    agencyId: string,
    context: Record<string, unknown>,
  ): Promise<Buffer> {
    // Resolve the trip-order template (agency override or system default)
    const template = await this.templatesService.resolvePublishedTemplate('trip-order', agencyId)
    if (!template || !template.pdfHtml) {
      throw new NotFoundException('Trip order PDF template not found')
    }

    // Embed logo as base64 data URI so it renders reliably in Puppeteer
    await this.embedLogoAsBase64(context)

    // Render the Handlebars HTML
    const renderedHtml = this.handlebars.render(template.pdfHtml, context)

    // Convert to PDF via Puppeteer
    return this.puppeteerPdf.renderHtmlToPdf(renderedHtml, template.pdfCss ?? undefined)
  }

  /**
   * Fetch the agency logo URL and replace it with a base64 data URI
   * so Puppeteer doesn't depend on external network access during PDF rendering.
   */
  private async embedLogoAsBase64(context: Record<string, unknown>): Promise<void> {
    const agency = context.agency as Record<string, unknown> | undefined
    const logoUrl = agency?.logo as string | undefined
    if (!logoUrl) return

    try {
      const response = await fetch(logoUrl)
      if (!response.ok) {
        this.logger.warn(`Failed to fetch logo for PDF embedding: ${response.status} ${logoUrl}`)
        return
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') || 'image/png'
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`
      agency!.logo = base64
    } catch (err) {
      this.logger.warn(`Failed to embed logo as base64: ${err}`)
      // Leave original URL as fallback — Puppeteer may still fetch it
    }
  }

  /**
   * Build a Handlebars-compatible context from live database data.
   * Variable names match the trip-order template expectations.
   */
  private buildTemplateContext(params: {
    trip: any
    businessConfig: BusinessConfiguration
    financialSummary: TripFinancialSummaryResponseDto
    passengers: any[]
    primaryContact: any
    agent: any
    bookings: any[]
    paymentSummary: TripOrderPaymentSummary
  }): Record<string, unknown> {
    const { trip, businessConfig, financialSummary, passengers, primaryContact, agent, bookings, paymentSummary } = params

    const totalCost = financialSummary.grandTotal.totalCostCents / 100

    return {
      trip: {
        name: trip.name,
        referenceNumber: trip.reference,
        reference: trip.reference,
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency || 'CAD',
        totalCost,
        destination: trip.destination ?? null,
      },
      contact: primaryContact
        ? {
            full_name: [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ') || 'Customer',
            first_name: primaryContact.firstName || '',
            last_name: primaryContact.lastName || '',
            email: primaryContact.email,
            phone: primaryContact.phone,
            addressLine1: primaryContact.address1 || primaryContact.addressLine1,
            city: primaryContact.city,
            province: primaryContact.stateProvince || primaryContact.province,
            postalCode: primaryContact.postalCode,
            country: primaryContact.country,
          }
        : { full_name: 'Customer' },
      agent: agent
        ? {
            full_name: [agent.firstName, agent.lastName].filter(Boolean).join(' '),
            email: agent.email,
            phone: agent.phone,
          }
        : null,
      agency: {
        name: businessConfig.company_name,
        logo: businessConfig.logo_url,
        address: businessConfig.full_address,
        phone: businessConfig.phone || businessConfig.toll_free,
        email: businessConfig.email,
      },
      businessConfig: {
        company_name: businessConfig.company_name,
        company_tagline: businessConfig.company_tagline || 'Discover, Soar, Repeat',
        tico_registration: businessConfig.tico_registration,
        hst_number: businessConfig.hst_number,
        logo_url: businessConfig.logo_url,
        primary_color: businessConfig.primary_color || '#c59746',
      },
      payment: {
        amountPaid: paymentSummary.processed_payments,
        balanceDue: paymentSummary.balance_due,
        totalPayments: paymentSummary.total_payments,
        pendingPayments: paymentSummary.pending_payments,
        refunds: paymentSummary.refunds,
        paymentsList: paymentSummary.payments_list,
        schedule: (paymentSummary as any).payment_schedule,
      },
      passengers: passengers.map((p) => ({
        full_name: [p.firstName, p.lastName].filter(Boolean).join(' '),
        firstName: p.firstName,
        lastName: p.lastName,
        type: p.passengerType || 'adult',
        // DOB excluded from invoice for privacy
      })),
      bookings: bookings.flatMap((b) => {
        const parent = {
          title: b.title || 'Booking',
          booking_type: b.bookingType || 'other',
          vendor_confirmation: b.vendorConfirmation || null,
          start_date: b.startDate,
          end_date: b.endDate,
          amount: Number(b.totalPrice || 0),
          currency: b.currency || 'CAD',
          cancellation_policy: b.cancellationPolicy || null,
          terms_and_conditions: b.termsAndConditions || null,
          non_refundable: b.nonRefundableDeposit ?? false,
          net_price: b.netPrice ?? null,
          supplier: b.supplier || null,
          per_passenger_breakdown: b.perPassengerBreakdown || null,
        }
        // Flatten package children as "Included" sub-items
        if (b.includedItems?.length > 0) {
          const children = b.includedItems.map((child: any) => ({
            title: `  └ ${child.name}`,
            booking_type: child.type,
            vendor_confirmation: child.confirmationNumber || null,
            amount: -1, // sentinel for "Included" — formatCurrency will render this
            currency: b.currency || 'CAD',
            _isIncluded: true,
          }))
          return [parent, ...children]
        }
        return [parent]
      }),
    }
  }

  /**
   * Build a Handlebars-compatible context from a stored trip order snapshot.
   * Maps the TICOTripOrder structure to the same variable names the template expects.
   */
  private buildSnapshotTemplateContext(
    orderData: TICOTripOrder,
    businessConfig: BusinessConfiguration,
    paymentSummary: TripOrderPaymentSummary,
    bookingDetails: TripOrderBookingDetail[],
  ): Record<string, unknown> {
    const header = orderData.order_header
    const costBreak = orderData.cost_breakdown

    return {
      trip: {
        name: orderData.service_details?.description || 'Trip',
        referenceNumber: header.order_number,
        reference: header.order_number,
        startDate: orderData.service_details?.travel_dates?.departure,
        endDate: orderData.service_details?.travel_dates?.return,
        currency: orderData.service_details?.currency || 'CAD',
        totalCost: costBreak.final_total,
        destination: orderData.service_details?.destination ?? null,
      },
      contact: {
        full_name: header.customer_info?.name || 'Customer',
        email: header.customer_info?.email,
        phone: header.customer_info?.phone,
        addressLine1: header.customer_info?.address?.street1,
        city: header.customer_info?.address?.city,
        province: header.customer_info?.address?.state,
        postalCode: header.customer_info?.address?.postal_code,
        country: header.customer_info?.address?.country,
      },
      agent: header.agent_info
        ? {
            full_name: header.agent_info.name,
            email: header.agent_info.email,
            phone: header.agent_info.phone,
          }
        : null,
      agency: {
        name: header.agency_info?.name || businessConfig.company_name,
        logo: businessConfig.logo_url,
        address: header.agency_info?.address || businessConfig.full_address,
        phone: header.agency_info?.phone || businessConfig.phone,
        email: header.agency_info?.email || businessConfig.email,
      },
      businessConfig: {
        company_name: businessConfig.company_name,
        company_tagline: businessConfig.company_tagline || 'Discover, Soar, Repeat',
        tico_registration: businessConfig.tico_registration,
        hst_number: businessConfig.hst_number,
        logo_url: businessConfig.logo_url,
        primary_color: businessConfig.primary_color || '#c59746',
      },
      payment: {
        amountPaid: paymentSummary?.processed_payments ?? 0,
        balanceDue: paymentSummary?.balance_due ?? costBreak.final_total,
        totalPayments: paymentSummary?.total_payments ?? 0,
        pendingPayments: paymentSummary?.pending_payments ?? 0,
        refunds: paymentSummary?.refunds ?? 0,
        paymentsList: paymentSummary?.payments_list ?? [],
        schedule: (paymentSummary as any)?.payment_schedule ?? null,
      },
      passengers: (orderData.service_details?.passengers || []).map((p) => ({
        full_name: [p.firstName, p.lastName].filter(Boolean).join(' '),
        firstName: p.firstName,
        lastName: p.lastName,
        type: p.type || 'adult',
        // DOB excluded from invoice for privacy
      })),
      bookings: (bookingDetails || []).flatMap((b) => {
        const parent = {
          title: b.title || 'Booking',
          booking_type: b.booking_type || 'other',
          vendor_confirmation: b.vendor_confirmation || null,
          start_date: b.start_date,
          end_date: b.end_date,
          amount: Number(b.amount || b.base_price || 0),
          currency: b.currency || orderData.service_details?.currency || 'CAD',
          cancellation_policy: b.cancellation_policy || null,
          terms_and_conditions: b.terms_and_conditions || null,
          supplier: b.supplier || null,
        }
        // Flatten package children as "Included" sub-items
        if (b.included_items?.length) {
          const children = b.included_items.map((child) => ({
            title: `  └ ${child.name}`,
            booking_type: child.type,
            vendor_confirmation: child.confirmationNumber || null,
            amount: -1, // sentinel for "Included"
            currency: parent.currency,
          }))
          return [parent, ...children]
        }
        return [parent]
      }),
    }
  }

  // ============================================================================
  // PRIVATE METHODS - Data Fetching
  // ============================================================================

  private async getTripDetails(tripId: string) {
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        status: this.db.schema.trips.status,
        startDate: this.db.schema.trips.startDate,
        endDate: this.db.schema.trips.endDate,
        currency: this.db.schema.trips.currency,
        description: this.db.schema.trips.description,
        reference: this.db.schema.trips.referenceNumber,
        primaryContactId: this.db.schema.trips.primaryContactId,
        ownerId: this.db.schema.trips.ownerId,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    return trip ?? null
  }

  private async getBusinessConfiguration(agencyId: string): Promise<BusinessConfiguration> {
    if (!agencyId) {
      return this.getDefaultBusinessConfig()
    }

    const [settings] = await this.db.client
      .select({
        logoUrl: this.db.schema.agencySettings.logoUrl,
        primaryColor: this.db.schema.agencySettings.primaryColor,
        companyPhone: this.db.schema.agencySettings.companyPhone,
        companyTollFree: this.db.schema.agencySettings.companyTollFree,
        companyEmail: this.db.schema.agencySettings.companyEmail,
        companyAddress: this.db.schema.agencySettings.companyAddress,
        ticoRegistration: this.db.schema.agencySettings.ticoRegistration,
      })
      .from(this.db.schema.agencySettings)
      .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
      .limit(1)

    // Get agency name from agencies table
    const [agency] = await this.db.client
      .select({ name: this.db.schema.agencies.name })
      .from(this.db.schema.agencies)
      .where(eq(this.db.schema.agencies.id, agencyId))
      .limit(1)

    const defaultConfig = this.getDefaultBusinessConfig()

    return {
      ...defaultConfig,
      company_name: agency?.name || defaultConfig.company_name,
      full_address: settings?.companyAddress || defaultConfig.full_address,
      phone: settings?.companyPhone || defaultConfig.phone,
      toll_free: settings?.companyTollFree || defaultConfig.toll_free,
      email: settings?.companyEmail || defaultConfig.email,
      tico_registration: settings?.ticoRegistration || defaultConfig.tico_registration,
      logo_url: settings?.logoUrl || undefined,
      primary_color: settings?.primaryColor || defaultConfig.primary_color,
    }
  }

  private getDefaultBusinessConfig(): BusinessConfiguration {
    return {
      company_name: 'Phoenix Voyages',
      company_tagline: 'Discover, Soar, Repeat',
      full_address: '',
      email: '',
      tico_registration: '',
      include_default_tico_disclosures: true,
      primary_color: '#c59746',
      secondary_color: '#e89e4a',
    }
  }

  private async getTripPassengers(tripId: string) {
    // Query trip travelers with their linked contacts
    const travelers = await this.db.client
      .select({
        id: this.db.schema.tripTravelers.id,
        travelerType: this.db.schema.tripTravelers.travelerType,
        contactId: this.db.schema.tripTravelers.contactId,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
        // Contact fields (if linked)
        contactFirstName: this.db.schema.contacts.firstName,
        contactLastName: this.db.schema.contacts.lastName,
        contactEmail: this.db.schema.contacts.email,
        contactDateOfBirth: this.db.schema.contacts.dateOfBirth,
      })
      .from(this.db.schema.tripTravelers)
      .leftJoin(
        this.db.schema.contacts,
        eq(this.db.schema.contacts.id, this.db.schema.tripTravelers.contactId)
      )
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    // Transform to expected format, preferring contact data over snapshot
    return travelers.map((t) => {
      const snapshot = t.contactSnapshot as { firstName?: string; lastName?: string; email?: string; dateOfBirth?: string } | null
      return {
        id: t.id,
        firstName: t.contactFirstName || snapshot?.firstName || '',
        lastName: t.contactLastName || snapshot?.lastName || '',
        dateOfBirth: t.contactDateOfBirth || snapshot?.dateOfBirth || null,
        passengerType: t.travelerType,
        email: t.contactEmail || snapshot?.email || null,
      }
    })
  }

  private async getPrimaryContact(tripId: string) {
    const trip = await this.getTripDetails(tripId)
    if (!trip?.primaryContactId) return null

    const [contact] = await this.db.client
      .select({
        id: this.db.schema.contacts.id,
        firstName: this.db.schema.contacts.firstName,
        lastName: this.db.schema.contacts.lastName,
        email: this.db.schema.contacts.email,
        phone: this.db.schema.contacts.phone,
        addressLine1: this.db.schema.contacts.addressLine1,
        addressLine2: this.db.schema.contacts.addressLine2,
        city: this.db.schema.contacts.city,
        province: this.db.schema.contacts.province,
        postalCode: this.db.schema.contacts.postalCode,
        country: this.db.schema.contacts.country,
      })
      .from(this.db.schema.contacts)
      .where(eq(this.db.schema.contacts.id, trip.primaryContactId))
      .limit(1)

    if (!contact) return null

    // Transform to expected format
    return {
      ...contact,
      address1: contact.addressLine1,
      address2: contact.addressLine2,
      stateProvince: contact.province,
    }
  }

  private async getTripAgent(tripId: string) {
    const trip = await this.getTripDetails(tripId)
    if (!trip?.ownerId) return null

    // userProfiles table has id = user id, plus firstName, lastName, email
    const [profile] = await this.db.client
      .select({
        id: this.db.schema.userProfiles.id,
        firstName: this.db.schema.userProfiles.firstName,
        lastName: this.db.schema.userProfiles.lastName,
        email: this.db.schema.userProfiles.email,
      })
      .from(this.db.schema.userProfiles)
      .where(eq(this.db.schema.userProfiles.id, trip.ownerId))
      .limit(1)

    if (!profile) return null

    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: null as string | null, // phone not in userProfiles schema
      extension: null as string | null,
    }
  }

  private async getTripBookings(tripId: string) {
    // Query itinerary activities with their pricing and financial details
    // Must check both itinerary chain AND direct trip_id for floating packages
    // Also JOIN suppliers to pull default T&C when activity-level T&C is empty
    const activities = await this.db.client.execute(sql`
      SELECT DISTINCT ON (ia.id)
        ia.id,
        ia.name,
        ia.activity_type,
        ia.confirmation_number,
        ia.start_datetime,
        ia.end_datetime,
        ap.total_price_cents,
        ap.currency,
        ap.cancellation_policy,
        ap.terms_and_conditions,
        ap.non_refundable_deposit,
        ap.net_price_cents,
        ap.pricing_breakdown_json,
        ap.supplier,
        ap.billed_to_trip_id,
        s.default_terms_and_conditions AS supplier_terms,
        s.default_cancellation_policy AS supplier_cancellation
      FROM itinerary_activities ia
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      LEFT JOIN suppliers s ON s.name = ap.supplier
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE ia.parent_activity_id IS NULL
        AND (i.trip_id = ${tripId} OR ia.trip_id = ${tripId})
      ORDER BY ia.id
    `) as any[]

    // For each activity, get per-passenger pricing from traveler_bookings
    const bookingsWithPassengers = await Promise.all(
      activities.map(async (a) => {
        const travelerBookings = await this.db.client
          .select({
            priceCents: this.db.schema.travelerBookings.priceCents,
            currency: this.db.schema.travelerBookings.currency,
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
            travelerId: this.db.schema.tripTravelers.id,
          })
          .from(this.db.schema.travelerBookings)
          .innerJoin(
            this.db.schema.tripTravelers,
            eq(this.db.schema.travelerBookings.tripTravelerId, this.db.schema.tripTravelers.id)
          )
          .innerJoin(
            this.db.schema.contacts,
            eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id)
          )
          .where(eq(this.db.schema.travelerBookings.activityId, a.id))

        // Raw SQL returns snake_case
        const billedToTripId = a.billed_to_trip_id
        const isBilledElsewhere = billedToTripId && billedToTripId !== tripId
        const totalPriceCents = isBilledElsewhere ? 0 : Number(a.total_price_cents ?? 0)
        const netPriceCents = isBilledElsewhere ? null : (a.net_price_cents ? Number(a.net_price_cents) : null)
        const pricingBreakdown = isBilledElsewhere ? null : a.pricing_breakdown_json

        // Fetch child activities (e.g. flights, transfers, hotel inside a package)
        const children = await this.db.client.execute(sql`
          SELECT ia.id, ia.name, ia.activity_type, ia.confirmation_number
          FROM itinerary_activities ia
          WHERE ia.parent_activity_id = ${a.id}
          ORDER BY ia.start_datetime ASC NULLS LAST, ia.sequence_order ASC
        `) as any[]

        return {
          id: a.id,
          title: a.name,
          bookingType: a.activity_type,
          vendorConfirmation: a.confirmation_number,
          startDate: a.start_datetime ? new Date(a.start_datetime).toISOString().split('T')[0] : null,
          endDate: a.end_datetime ? new Date(a.end_datetime).toISOString().split('T')[0] : null,
          totalPrice: totalPriceCents / 100,
          currency: a.currency || 'CAD',
          // Group billing: flag items billed to another trip
          includedInGroupPackage: isBilledElsewhere || false,
          // Fall back to supplier defaults from Library when activity-level T&C are empty
          cancellationPolicy: a.cancellation_policy || a.supplier_cancellation || null,
          termsAndConditions: a.terms_and_conditions || a.supplier_terms || null,
          nonRefundableDeposit: a.non_refundable_deposit ?? false,
          netPrice: netPriceCents ? netPriceCents / 100 : null,
          supplier: a.supplier || null,
          perPassengerBreakdown: travelerBookings.length > 0
            ? travelerBookings.map((tb) => ({
                passengerId: tb.travelerId,
                passengerName: [tb.firstName, tb.lastName].filter(Boolean).join(' '),
                total: tb.priceCents ? tb.priceCents / 100 : 0,
              }))
            : pricingBreakdown
              ? (pricingBreakdown as any[]).map((p: any) => ({
                  passengerId: p.travelerId || p.id,
                  passengerName: p.name || p.travelerName || 'Passenger',
                  total: p.totalCents ? p.totalCents / 100 : (p.total || 0),
                }))
              : null,
          // Child activities included in this package (displayed as "Included" sub-items)
          includedItems: children.length > 0
            ? children.map((c: any) => ({
                name: c.name,
                type: c.activity_type,
                confirmationNumber: c.confirmation_number || null,
              }))
            : undefined,
        }
      })
    )

    return bookingsWithPassengers
  }

  /**
   * Generate a Group Trip Order PDF — aggregated by activity type.
   * Includes all activities billed to the master trip across all sub-trips.
   */
  async generateGroupTripOrder(groupId: string, agencyId: string): Promise<Buffer> {
    // Get group + master trip
    const [group] = await this.db.client
      .select()
      .from(this.db.schema.tripGroups)
      .where(and(eq(this.db.schema.tripGroups.id, groupId), eq(this.db.schema.tripGroups.agencyId, agencyId)))
      .limit(1)

    if (!group) throw new NotFoundException('Trip group not found')
    if (!group.masterTripId) throw new BadRequestException('Group has no master trip — set one first')

    const masterTripId = group.masterTripId

    // Get master trip details
    const [masterTrip] = await this.db.client
      .select()
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, masterTripId))
      .limit(1)

    if (!masterTrip) throw new NotFoundException('Master trip not found')

    // Get all activities billed to the master trip (across all sub-trips)
    const activities = await this.db.client.execute(sql`
      SELECT
        ia.activity_type,
        ap.total_price_cents,
        ap.currency
      FROM activity_pricing ap
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      WHERE (ap.billed_to_trip_id = ${masterTripId}
        OR (ap.billed_to_trip_id IS NULL AND EXISTS (
          SELECT 1 FROM itinerary_days iday
          JOIN itineraries i ON i.id = iday.itinerary_id
          WHERE iday.id = ia.itinerary_day_id AND i.trip_id = ${masterTripId}
        )))
        AND ia.parent_activity_id IS NULL
    `) as any[]

    // Aggregate by activity type
    const typeTotals = new Map<string, number>()
    let grandTotalCents = 0
    const currency = masterTrip.currency || 'CAD'

    for (const a of activities) {
      const type = a.activity_type || 'other'
      const cents = Number(a.total_price_cents ?? 0)
      typeTotals.set(type, (typeTotals.get(type) || 0) + cents)
      grandTotalCents += cents
    }

    // Format type labels
    const typeLabels: Record<string, string> = {
      flight: 'Flights',
      lodging: 'Hotels & Accommodations',
      transportation: 'Transfers & Transportation',
      tour: 'Tours & Excursions',
      insurance: 'Travel Insurance',
      package: 'Packages',
      cruise: 'Cruises',
      dining: 'Dining',
      activity: 'Activities',
      other: 'Other',
    }

    const lineItems = Array.from(typeTotals.entries())
      .sort((a, b) => b[1] - a[1]) // Highest cost first
      .map(([type, cents]) => ({
        category: typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1),
        totalPrice: cents / 100,
        currency,
      }))

    // Get business config
    const businessConfig = await this.getBusinessConfiguration(agencyId)

    // Get primary contact from master trip
    const primaryContact = masterTrip.primaryContactId
      ? await this.db.client
          .select({
            firstName: this.db.schema.contacts.firstName,
            lastName: this.db.schema.contacts.lastName,
            email: this.db.schema.contacts.email,
          })
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, masterTrip.primaryContactId))
          .limit(1)
          .then(r => r[0] || null)
      : null

    // Get all trips in the group
    const groupTrips = await this.db.client
      .select({ id: this.db.schema.trips.id, name: this.db.schema.trips.name })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.tripGroupId, groupId))

    // Build context for Handlebars template
    const context: Record<string, unknown> = {
      is_group_trip_order: true,
      group_name: group.name,
      group_number: group.groupNumber,
      trip_name: masterTrip.name,
      trip_reference: masterTrip.referenceNumber,
      start_date: group.startDate || masterTrip.startDate,
      end_date: group.endDate || masterTrip.endDate,
      destination: group.destination || null,
      currency,
      client: primaryContact ? {
        first_name: primaryContact.firstName,
        last_name: primaryContact.lastName,
        email: primaryContact.email,
      } : null,
      // Group-specific: aggregated line items by activity type
      group_line_items: lineItems,
      group_grand_total: grandTotalCents / 100,
      group_trip_count: groupTrips.length,
      business: businessConfig,
      generated_date: new Date().toISOString().split('T')[0],
    }

    return this.renderTripOrderPdf(agencyId, context)
  }

  /**
   * Generate a Group Manifest PDF — all travelers with details.
   * Best-effort: includes passport, room, flight data when available.
   */
  async generateGroupManifest(groupId: string, agencyId: string): Promise<Buffer> {
    const [group] = await this.db.client
      .select()
      .from(this.db.schema.tripGroups)
      .where(and(eq(this.db.schema.tripGroups.id, groupId), eq(this.db.schema.tripGroups.agencyId, agencyId)))
      .limit(1)

    if (!group) throw new NotFoundException('Trip group not found')

    // Get all trips in the group
    const trips = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        name: this.db.schema.trips.name,
        referenceNumber: this.db.schema.trips.referenceNumber,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.tripGroupId, groupId))

    // Get all travelers with contact details for each trip
    const travelers: Array<{
      tripName: string
      firstName: string | null
      lastName: string | null
      email: string | null
      phone: string | null
      dateOfBirth: string | null
      passportNumber: string | null
      passportExpiry: string | null
      nationality: string | null
    }> = []

    for (const trip of trips) {
      const tripTravelers = await this.db.client
        .select({
          firstName: this.db.schema.contacts.firstName,
          lastName: this.db.schema.contacts.lastName,
          email: this.db.schema.contacts.email,
          phone: this.db.schema.contacts.phone,
          dateOfBirth: this.db.schema.contacts.dateOfBirth,
          passportNumber: this.db.schema.contacts.passportNumber,
          passportExpiry: this.db.schema.contacts.passportExpiry,
          nationality: this.db.schema.contacts.nationality,
        })
        .from(this.db.schema.tripTravelers)
        .innerJoin(
          this.db.schema.contacts,
          eq(this.db.schema.tripTravelers.contactId, this.db.schema.contacts.id),
        )
        .where(eq(this.db.schema.tripTravelers.tripId, trip.id))

      for (const t of tripTravelers) {
        travelers.push({ tripName: trip.name, ...t })
      }
    }

    const businessConfig = await this.getBusinessConfiguration(agencyId)

    const context: Record<string, unknown> = {
      is_group_manifest: true,
      group_name: group.name,
      group_number: group.groupNumber,
      destination: group.destination,
      start_date: group.startDate,
      end_date: group.endDate,
      travelers,
      traveler_count: travelers.length,
      trip_count: trips.length,
      business: businessConfig,
      generated_date: new Date().toISOString().split('T')[0],
    }

    return this.renderTripOrderPdf(agencyId, context)
  }

  private async getTripPayments(tripId: string) {
    // Join through: payment_transactions → expected_payment_items → payment_schedule_config
    //   → activity_pricing → itinerary_activities → (itineraries chain OR direct trip_id)
    // Must use LEFT JOIN for itinerary chain + OR for floating activities
    const transactions = await this.db.client.execute(sql`
      SELECT DISTINCT ON (ptx.id)
        ptx.id,
        ptx.amount_cents,
        ptx.transaction_type,
        ptx.payment_method,
        ptx.transaction_date,
        ptx.reference_number,
        ptx.notes
      FROM payment_transactions ptx
      JOIN expected_payment_items epi ON epi.id = ptx.expected_payment_item_id
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE (i.trip_id = ${tripId} OR ia.trip_id = ${tripId})
      ORDER BY ptx.id
    `) as any[]

    // Map transaction_type to the status format expected by buildPaymentSummary
    return transactions.map((t: any) => ({
      id: t.id,
      amount: Number(t.amount_cents) / 100,
      paymentDate: t.transaction_date ? new Date(t.transaction_date).toISOString().split('T')[0] : null,
      paymentMethodType: t.payment_method,
      status: t.transaction_type === 'payment' ? 'processed'
            : t.transaction_type === 'refund' ? 'refunded'
            : 'processed',
      notes: t.notes,
    }))
  }

  /**
   * Get payment schedule info for TICO compliance:
   * deposit amounts, non-refundable amounts, and expected payment items with due dates
   */
  private async getTripPaymentScheduleInfo(tripId: string): Promise<TripOrderPaymentScheduleSummary> {
    // Get expected payment items with their schedule config and activity name
    // Must check both itinerary chain AND direct trip_id for floating packages
    const items = await this.db.client.execute(sql`
      SELECT
        epi.id AS item_id,
        epi.payment_name,
        epi.expected_amount_cents,
        epi.paid_amount_cents,
        epi.due_date,
        epi.status,
        epi.sequence_order,
        psc.schedule_type,
        psc.non_refundable_amount_cents,
        psc.deposit_amount_cents,
        ia.name AS activity_name
      FROM expected_payment_items epi
      JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
      JOIN activity_pricing ap ON ap.id = psc.component_pricing_id
      JOIN itinerary_activities ia ON ia.id = ap.activity_id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE (i.trip_id = ${tripId} OR ia.trip_id = ${tripId})
    `) as any[]

    let totalScheduledAmount = 0
    let totalPendingAmount = 0
    let totalPaidFromSchedule = 0

    const scheduleItems = items.map((item: any) => {
      const expected = Number(item.expected_amount_cents ?? 0) / 100
      const paid = Number(item.paid_amount_cents ?? 0) / 100
      totalScheduledAmount += expected
      totalPaidFromSchedule += paid
      if (item.status === 'pending' || item.status === 'partial' || item.status === 'overdue') {
        totalPendingAmount += expected - paid
      }

      // Build TICO disclosure for non-refundable deposits
      let disclosureText: string | undefined
      const nonRefCents = Number(item.non_refundable_amount_cents ?? 0)
      if (nonRefCents > 0) {
        const nonRefundable = nonRefCents / 100
        disclosureText = `Includes $${nonRefundable.toFixed(2)} non-refundable`
      }

      return {
        booking_title: item.activity_name || 'Booking',
        description: item.payment_name,
        due_date: item.due_date || '',
        amount: expected,
        amount_paid: paid,
        status: item.status,
        disclosure_text: disclosureText,
      }
    })

    // Sort by sequence order then due date
    scheduleItems.sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })

    return {
      total_scheduled_amount: totalScheduledAmount,
      total_pending_amount: totalPendingAmount,
      total_paid_from_schedule: totalPaidFromSchedule,
      schedule_items: scheduleItems,
    }
  }

  // ============================================================================
  // PRIVATE METHODS - Data Building
  // ============================================================================

  private buildTripOrderData(params: {
    trip: any
    businessConfig: BusinessConfiguration
    financialSummary: TripFinancialSummaryResponseDto
    passengers: any[]
    primaryContact: any
    agent: any
    bookings: any[]
  }): TICOTripOrder {
    const { trip, businessConfig, financialSummary, passengers, primaryContact, agent, bookings } = params

    // Calculate cost breakdown from bookings
    const baseCost = bookings.reduce((sum, b) => sum + Number(b.totalPrice || 0), 0)
    const finalTotal = financialSummary.grandTotal.totalCostCents / 100

    const orderDate = new Date().toISOString().split('T')[0] ?? new Date().toISOString().substring(0, 10)

    return {
      order_header: {
        title: 'Trip Order',
        order_number: trip.reference || `TRIP-${trip.id.slice(0, 8).toUpperCase()}`,
        order_date: orderDate,
        agency_info: {
          name: businessConfig.company_name,
          tico_registration: businessConfig.tico_registration,
          address: businessConfig.full_address,
          phone: businessConfig.toll_free || businessConfig.phone,
          email: businessConfig.email,
        },
        customer_info: primaryContact
          ? {
              name: `${primaryContact.firstName || ''} ${primaryContact.lastName || ''}`.trim() || 'Customer',
              email: primaryContact.email || undefined,
              phone: primaryContact.phone || undefined,
              address: {
                street1: primaryContact.address1 || undefined,
                street2: primaryContact.address2 || undefined,
                city: primaryContact.city || undefined,
                state: primaryContact.stateProvince || undefined,
                postal_code: primaryContact.postalCode || undefined,
                country: primaryContact.country || undefined,
              },
            }
          : { name: 'Customer' },
        agent_info: agent
          ? {
              name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim(),
              email: agent.email || undefined,
              phone: agent.phone || undefined,
              extension: agent.extension || undefined,
            }
          : undefined,
      },
      service_details: {
        description: trip.description || trip.name || 'Travel Services',
        travel_dates: trip.startDate
          ? {
              departure: trip.startDate,
              return: trip.endDate || undefined,
            }
          : undefined,
        currency: trip.currency || 'CAD',
        passengers: passengers.map((p) => ({
          id: p.id,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          type: p.passengerType as 'adult' | 'child' | 'infant' | undefined,
          dateOfBirth: p.dateOfBirth || undefined,
        })),
      },
      cost_breakdown: {
        service_description: trip.description || trip.name || 'Travel Services',
        base_cost: baseCost,
        supplier_fees: [],
        ncf_fees: [],
        subtotal: baseCost,
        final_total: finalTotal,
        payment_instructions: {
          pay_to_supplier: {
            amount: finalTotal,
            instructions: 'Pay as per booking confirmation details.',
          },
        },
        compliance_notes: [
          'This Trip Order shows all costs you will pay for travel services and any applicable agency fees.',
          'The agency receives commission from suppliers included in the quoted prices.',
        ],
        per_passenger_breakdown: this.buildPerPassengerBreakdown(bookings, passengers),
      },
      compliance_statement: this.generateComplianceStatement(businessConfig),
      generated_at: new Date().toISOString(),
    }
  }

  /**
   * Build per-passenger cost breakdown from booking data.
   * Uses traveler_bookings pricing when available, otherwise divides evenly.
   */
  private buildPerPassengerBreakdown(
    bookings: any[],
    passengers: any[]
  ): CostBreakdown['per_passenger_breakdown'] {
    if (passengers.length === 0) return undefined

    // Check if any booking has per-passenger data
    const hasPerPassengerData = bookings.some((b) => b.perPassengerBreakdown?.length > 0)

    if (hasPerPassengerData) {
      // Aggregate per-passenger totals across all bookings
      const passengerTotals = new Map<string, { name: string; total: number }>()
      for (const booking of bookings) {
        if (!booking.perPassengerBreakdown) continue
        for (const pp of booking.perPassengerBreakdown) {
          const existing = passengerTotals.get(pp.passengerId)
          if (existing) {
            existing.total += pp.total
          } else {
            passengerTotals.set(pp.passengerId, { name: pp.passengerName, total: pp.total })
          }
        }
      }
      return Array.from(passengerTotals.entries()).map(([id, data]) => ({
        passenger_id: id,
        passenger_name: data.name,
        base_fare: data.total,
        total: data.total,
      }))
    }

    // Fallback: divide total evenly among passengers
    const totalCost = bookings.reduce((sum, b) => sum + Number(b.totalPrice || 0), 0)
    const perPerson = totalCost / passengers.length

    return passengers.map((p) => ({
      passenger_id: p.id,
      passenger_name: [p.firstName, p.lastName].filter(Boolean).join(' '),
      base_fare: Math.round(perPerson * 100) / 100,
      total: Math.round(perPerson * 100) / 100,
    }))
  }

  private buildPaymentSummary(payments: any[], totalCost: number): TripOrderPaymentSummary {
    const processedPayments = payments.filter((p) => p.status === 'processed')
    const pendingPayments = payments.filter((p) => p.status === 'pending')
    const refundedPayments = payments.filter((p) => p.status === 'refunded')

    const totalProcessed = processedPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    const totalRefunded = refundedPayments.reduce((sum, p) => sum + Number(p.amount), 0)

    const netProcessed = totalProcessed - totalRefunded
    const balanceDue = totalCost - netProcessed

    return {
      total_payments: totalProcessed + totalPending,
      processed_payments: totalProcessed,
      pending_payments: totalPending,
      refunds: totalRefunded,
      balance_due: Math.max(0, balanceDue),
      payments_list: payments
        .filter((p) => p.status !== 'refunded')
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
        .map((payment) => ({
          date: payment.paymentDate,
          amount: Number(payment.amount),
          payment_method_type: this.formatPaymentMethod(payment.paymentMethodType),
          status: payment.status,
          notes: payment.notes,
        })),
    }
  }

  private buildBookingDetails(bookings: any[]): TripOrderBookingDetail[] {
    return bookings.map((booking) => ({
      booking_id: booking.id,
      title: booking.title || 'Booking',
      booking_type: booking.bookingType || 'other',
      vendor_confirmation: booking.vendorConfirmation || undefined,
      start_date: booking.startDate || undefined,
      end_date: booking.endDate || undefined,
      base_price: Number(booking.totalPrice || 0),
      taxes: 0,
      amount: Number(booking.totalPrice || 0),
      currency: booking.currency || 'CAD',
      // TICO-required financial details
      cancellation_policy: booking.cancellationPolicy || undefined,
      terms_and_conditions: booking.termsAndConditions || undefined,
      non_refundable: booking.nonRefundableDeposit ?? false,
      net_price: booking.netPrice ?? undefined,
      supplier: booking.supplier || undefined,
      per_passenger_breakdown: booking.perPassengerBreakdown || undefined,
      // Child activities included in this package
      included_items: booking.includedItems || undefined,
    } as TripOrderBookingDetail))
  }

  private formatPaymentMethod(type: string): string {
    switch (type) {
      case 'credit_card':
        return 'Credit Card'
      case 'cash':
        return 'Cash'
      case 'wire_transfer':
        return 'Wire Transfer'
      case 'gift_certificate':
        return 'Gift Certificate'
      case 'check':
        return 'Check'
      case 'bank_transfer':
        return 'Bank Transfer'
      default:
        return type || 'Other'
    }
  }

  private generateComplianceStatement(businessConfig: BusinessConfiguration): string {
    let statement = '--- IMPORTANT DISCLOSURES ---\n\n'

    statement +=
      'This Trip Order details all costs for your travel services. You will pay the supplier directly for travel services as detailed in the payment instructions.\n\n'

    statement +=
      'The agency receives commission from suppliers included in the quoted prices. Commission amounts are not disclosed separately as they are included in supplier pricing.\n\n'

    statement += 'REGULATORY INFORMATION:\n'

    if (businessConfig.tico_registration) {
      statement += `${businessConfig.company_name} is registered with TICO (Travel Industry Council of Ontario) Registration #${businessConfig.tico_registration}. `
    }

    statement +=
      'As a TICO registrant, this agency contributes to the Travel Compensation Fund which may reimburse eligible customers in case of agency default. For disputes that cannot be resolved with the agency, you may contact TICO at 1-888-451-8426 or visit www.tico.ca.\n\n'

    statement += '--- END DISCLOSURES ---'

    if (businessConfig.trip_order_terms) {
      statement += '\n\n' + businessConfig.trip_order_terms
    }

    return statement
  }

  // ============================================================================
  // PRIVATE METHODS - Recipient Building
  // ============================================================================

  private async buildRecipientList(
    tripId: string,
    options: SendTripOrderEmailOptions
  ): Promise<{ to: string[]; cc: string[] }> {
    const recipients: { to: string[]; cc: string[] } = { to: [], cc: [] }

    // Custom recipients
    if (options.to?.length) {
      recipients.to.push(...options.to)
    }

    // Primary contact (default: true)
    if (options.includePrimaryContact !== false) {
      const contact = await this.getPrimaryContact(tripId)
      if (contact?.email) {
        recipients.to.push(contact.email)
      }
    }

    // Passengers
    if (options.includePassengers) {
      const passengers = await this.getTripPassengers(tripId)
      passengers.forEach((p) => {
        if (p.email) {
          recipients.to.push(p.email)
        }
      })
    }

    // Agent CC
    if (options.includeAgent) {
      const agent = await this.getTripAgent(tripId)
      if (agent?.email) {
        recipients.cc.push(agent.email)
      }
    }

    // Custom CC
    if (options.cc?.length) {
      recipients.cc.push(...options.cc)
    }

    // Deduplicate
    recipients.to = [...new Set(recipients.to)]
    recipients.cc = [...new Set(recipients.cc.filter((email) => !recipients.to.includes(email)))]

    return recipients
  }
}
