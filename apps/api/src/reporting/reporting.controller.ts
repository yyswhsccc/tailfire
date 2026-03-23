/**
 * Reporting Controller
 *
 * REST endpoints for the reporting system:
 *   GET /reporting/catalog        — role-filtered report catalog
 *   GET /reporting/:slug          — run a report with filters and pagination
 *   GET /reporting/:slug/export   — export report as CSV or PDF
 */

import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ReportingService } from './reporting.service'
import {
  ReportExportService,
  type ExportColumnDef,
  type ExportCellValue,
  type ExportContext,
  type SummaryItem,
} from './export/report-export.service'
import { ReportQueryDto, ExportReportDto } from './dto/report-query.dto'

// ---------------------------------------------------------------------------
// Column definitions per report slug (booked-sales only — Task 13 fills rest)
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string
  header: string
  mono?: boolean
  align?: 'right' | 'left'
}

const REPORT_COLUMNS: Record<string, ColumnDef[]> = {
  // ── Sales ────────────────────────────────────────────────────────────────
  'booked-sales': [
    { key: 'tripName', header: 'Trip' },
    { key: 'referenceNumber', header: 'Ref #', mono: true },
    { key: 'agentName', header: 'Agent' },
    { key: 'clientName', header: 'Client' },
    { key: 'bookedDate', header: 'Booked' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'travelerCount', header: 'Pax', align: 'right' },
    { key: 'activityCount', header: 'Items', align: 'right' },
    { key: 'totalPriceCents', header: 'Total', align: 'right' },
  ],

  'departed-sales': [
    { key: 'tripName', header: 'Trip' },
    { key: 'referenceNumber', header: 'Ref #', mono: true },
    { key: 'agentName', header: 'Agent' },
    { key: 'clientName', header: 'Client' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'returnDate', header: 'Return' },
    { key: 'travelerCount', header: 'Pax', align: 'right' },
    { key: 'activityCount', header: 'Items', align: 'right' },
    { key: 'totalPriceCents', header: 'Total', align: 'right' },
  ],

  'sales-by-agent': [
    { key: 'agentName', header: 'Agent' },
    { key: 'bookingCount', header: 'Bookings', align: 'right' },
    { key: 'totalSalesCents', header: 'Total Sales', align: 'right' },
    { key: 'avgBookingValueCents', header: 'Avg Booking', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  'sales-by-destination': [
    { key: 'destination', header: 'Destination' },
    { key: 'tripType', header: 'Trip Type' },
    { key: 'bookingCount', header: 'Bookings', align: 'right' },
    { key: 'travelerCount', header: 'Pax', align: 'right' },
    { key: 'totalSalesCents', header: 'Total Sales', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  'booked-sales-by-supplier': [
    { key: 'supplierName', header: 'Supplier' },
    { key: 'activityType', header: 'Type' },
    { key: 'activityCount', header: 'Items', align: 'right' },
    { key: 'totalSalesCents', header: 'Total Sales', align: 'right' },
    { key: 'commissionCents', header: 'Commission', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  'departed-sales-by-supplier': [
    { key: 'supplierName', header: 'Supplier' },
    { key: 'activityType', header: 'Type' },
    { key: 'activityCount', header: 'Items', align: 'right' },
    { key: 'totalSalesCents', header: 'Total Sales', align: 'right' },
    { key: 'commissionCents', header: 'Commission', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  // ── Financial ─────────────────────────────────────────────────────────────
  'booking-pipeline': [
    { key: 'status', header: 'Status' },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'totalEstimatedCents', header: 'Est. Value', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  'commission-aging': [
    { key: 'activityName', header: 'Activity' },
    { key: 'supplierName', header: 'Supplier' },
    { key: 'tripName', header: 'Trip' },
    { key: 'agentName', header: 'Agent' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'daysSinceDeparture', header: 'Days Out', align: 'right' },
    { key: 'agingBucket', header: 'Aging' },
    { key: 'expectedCents', header: 'Expected', align: 'right' },
    { key: 'receivedCents', header: 'Received', align: 'right' },
    { key: 'outstandingCents', header: 'Outstanding', align: 'right' },
  ],

  'commission-reconciliation': [
    { key: 'checkNumber', header: 'Check #', mono: true },
    { key: 'supplierName', header: 'Supplier' },
    { key: 'checkDate', header: 'Date' },
    { key: 'status', header: 'Status' },
    { key: 'itemCount', header: 'Items', align: 'right' },
    { key: 'checkAmountCents', header: 'Check Amount', align: 'right' },
    { key: 'matchedAmountCents', header: 'Matched', align: 'right' },
    { key: 'unmatchedAmountCents', header: 'Unmatched', align: 'right' },
  ],

  'payment-schedule': [
    { key: 'tripName', header: 'Trip' },
    { key: 'clientName', header: 'Client' },
    { key: 'agentName', header: 'Agent' },
    { key: 'itemLabel', header: 'Payment' },
    { key: 'dueDate', header: 'Due Date' },
    { key: 'daysUntilDue', header: 'Days Until Due', align: 'right' },
    { key: 'status', header: 'Status' },
    { key: 'amountCents', header: 'Amount', align: 'right' },
    { key: 'paidCents', header: 'Paid', align: 'right' },
    { key: 'remainingCents', header: 'Remaining', align: 'right' },
  ],

  'agent-commission-statement': [
    { key: 'activityName', header: 'Activity' },
    { key: 'tripName', header: 'Trip' },
    { key: 'supplierName', header: 'Supplier' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'totalSalesCents', header: 'Sales', align: 'right' },
    { key: 'commissionRate', header: 'Rate %', align: 'right' },
    { key: 'grossCommissionCents', header: 'Gross Comm.', align: 'right' },
    { key: 'receivedCents', header: 'Received', align: 'right' },
    { key: 'paidToAgentCents', header: 'Paid to Agent', align: 'right' },
    { key: 'pendingCents', header: 'Pending', align: 'right' },
  ],

  // ── Operational ───────────────────────────────────────────────────────────
  'upcoming-departures': [
    { key: 'tripName', header: 'Trip' },
    { key: 'clientName', header: 'Client' },
    { key: 'agentName', header: 'Agent' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'daysUntilDeparture', header: 'Days Away', align: 'right' },
    { key: 'travelerCount', header: 'Pax', align: 'right' },
    { key: 'paymentStatus', header: 'Payment' },
    { key: 'outstandingCents', header: 'Outstanding', align: 'right' },
    { key: 'documentsComplete', header: 'Docs' },
  ],

  // ── Compliance ────────────────────────────────────────────────────────────
  'ontario-gross-sales': [
    { key: 'month', header: 'Month' },
    { key: 'bookingCount', header: 'Bookings', align: 'right' },
    { key: 'totalSalesCents', header: 'Total Sales', align: 'right' },
    { key: 'serviceFeesCents', header: 'Service Fees', align: 'right' },
    { key: 'grossSalesCents', header: 'Gross Sales', align: 'right' },
    { key: 'currency', header: 'Currency' },
  ],

  // ── CRM ───────────────────────────────────────────────────────────────────
  'client-spending': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'totalSpendCents', header: 'Total Spend', align: 'right' },
    { key: 'avgTripValueCents', header: 'Avg Trip', align: 'right' },
    { key: 'firstTripDate', header: 'First Trip' },
    { key: 'lastTripDate', header: 'Last Trip' },
  ],

  'repeat-clients': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'totalSpendCents', header: 'Total Spend', align: 'right' },
    { key: 'firstTripDate', header: 'First Trip' },
    { key: 'lastTripDate', header: 'Last Trip' },
    { key: 'avgDaysBetweenTrips', header: 'Avg Days Between', align: 'right' },
  ],

  'dormant-clients': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'agentName', header: 'Agent' },
    { key: 'lastTripDate', header: 'Last Trip' },
    { key: 'daysSinceLastTrip', header: 'Days Dormant', align: 'right' },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'lifetimeSpendCents', header: 'Lifetime Spend', align: 'right' },
  ],

  'passport-expiry': [
    { key: 'travelerName', header: 'Traveler' },
    { key: 'passportNumber', header: 'Passport #', mono: true },
    { key: 'nationality', header: 'Nationality' },
    { key: 'passportExpiry', header: 'Expiry Date' },
    { key: 'daysUntilExpiry', header: 'Days Until Expiry', align: 'right' },
    { key: 'upcomingTripName', header: 'Upcoming Trip' },
    { key: 'upcomingTripDate', header: 'Trip Date' },
  ],

  'upcoming-birthdays': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'agentName', header: 'Agent' },
    { key: 'birthDate', header: 'Birthday' },
    { key: 'age', header: 'Age', align: 'right' },
    { key: 'daysUntilBirthday', header: 'Days Away', align: 'right' },
  ],

  'new-clients': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'agentName', header: 'Agent' },
    { key: 'createdAt', header: 'Joined' },
    { key: 'hasTrip', header: 'Has Trip' },
    { key: 'firstTripDate', header: 'First Trip' },
  ],

  'client-data-completeness': [
    { key: 'clientName', header: 'Client' },
    { key: 'completenessScore', header: 'Score %', align: 'right' },
    { key: 'hasEmail', header: 'Email' },
    { key: 'hasPhone', header: 'Phone' },
    { key: 'hasAddress', header: 'Address' },
    { key: 'hasDob', header: 'DOB' },
    { key: 'hasPassport', header: 'Passport' },
    { key: 'missingFields', header: 'Missing' },
  ],

  'top-clients-revenue': [
    { key: 'clientName', header: 'Client' },
    { key: 'email', header: 'Email' },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'totalSpendCents', header: 'Total Spend', align: 'right' },
    { key: 'avgTripValueCents', header: 'Avg Trip', align: 'right' },
    { key: 'lastTripDate', header: 'Last Trip' },
  ],

  // ── Insurance ─────────────────────────────────────────────────────────────
  'insurance-penetration': [
    { key: 'period', header: 'Period' },
    { key: 'totalTravelers', header: 'Total Pax', align: 'right' },
    { key: 'coveredTravelers', header: 'Covered', align: 'right' },
    { key: 'ownInsuranceTravelers', header: 'Own Insurance', align: 'right' },
    { key: 'declinedTravelers', header: 'Declined', align: 'right' },
    { key: 'pendingTravelers', header: 'Pending', align: 'right' },
    { key: 'penetrationRate', header: 'Rate %', align: 'right' },
  ],

  'insurance-declines': [
    { key: 'tripName', header: 'Trip' },
    { key: 'travelerName', header: 'Traveler' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'declinedAt', header: 'Declined At' },
    { key: 'declinedReason', header: 'Reason' },
    { key: 'isAcknowledged', header: 'Acknowledged' },
    { key: 'acknowledgedAt', header: 'Acknowledged At' },
  ],

  'insurance-revenue': [
    { key: 'providerName', header: 'Provider' },
    { key: 'packageName', header: 'Package' },
    { key: 'policyType', header: 'Policy Type' },
    { key: 'packageCount', header: 'Policies', align: 'right' },
    { key: 'travelerCount', header: 'Travelers', align: 'right' },
    { key: 'totalPremiumCents', header: 'Total Premium', align: 'right' },
    { key: 'totalCoverageCents', header: 'Total Coverage', align: 'right' },
  ],

  'insurance-by-policy-type': [
    { key: 'policyType', header: 'Policy Type' },
    { key: 'packageCount', header: 'Policies', align: 'right' },
    { key: 'travelerCount', header: 'Travelers', align: 'right' },
    { key: 'totalPremiumCents', header: 'Total Premium', align: 'right' },
    { key: 'avgPremiumCents', header: 'Avg Premium', align: 'right' },
    { key: 'penetrationRate', header: 'Rate %', align: 'right' },
  ],

  'insurance-unresolved': [
    { key: 'tripName', header: 'Trip' },
    { key: 'travelerName', header: 'Traveler' },
    { key: 'agentName', header: 'Agent' },
    { key: 'departureDate', header: 'Departure' },
    { key: 'daysUntilDeparture', header: 'Days Away', align: 'right' },
    { key: 'status', header: 'Status' },
  ],
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('reporting')
@UseGuards(JwtAuthGuard)
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly exportService: ReportExportService,
  ) {}

  // -------------------------------------------------------------------------
  // GET /reporting/catalog
  // -------------------------------------------------------------------------

  @Get('catalog')
  getCatalog(@GetAuthContext() auth: AuthContext) {
    return this.reporting.getCatalog(auth)
  }

  // -------------------------------------------------------------------------
  // GET /reporting/:slug
  // -------------------------------------------------------------------------

  @Get(':slug')
  async runReport(
    @Param('slug') slug: string,
    @GetAuthContext() auth: AuthContext,
    @Query() query: ReportQueryDto,
  ) {
    const result = await this.reporting.runReport(slug, auth, query)

    // Compute totals and summaryItems from column definitions
    const columns = this.getColumnsForReport(slug)
    if (columns && Array.isArray(result.data) && result.data.length > 0) {
      result.totals = this.computeTotals(result.data as any[], columns)
      result.summaryItems = this.buildSummaryItems(
        result.data as any[],
        columns,
        result.totalRows,
        result.summary,
      )
    }

    return result
  }

  // -------------------------------------------------------------------------
  // GET /reporting/:slug/export
  // -------------------------------------------------------------------------

  @Get(':slug/export')
  async exportReport(
    @Param('slug') slug: string,
    @GetAuthContext() auth: AuthContext,
    @Query() query: ExportReportDto,
    @Res() res: Response,
  ) {
    // Run the report with a large page size to capture all rows for export
    const reportQuery: ReportQueryDto = {
      ...query,
      page: 1,
      pageSize: 10000,
    }
    const report = await this.reporting.runReport(slug, auth, reportQuery)

    const columns = this.getColumnsForReport(slug)
    if (!columns) {
      throw new BadRequestException(
        `Export not yet supported for report "${slug}"`,
      )
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const filename = `${slug}-${timestamp}`

    if (query.format === 'csv') {
      // Build export columns and rows for CSV
      const exportColumns: ExportColumnDef[] = columns.map((col) => ({
        label: col.header,
        numeric: col.align === 'right',
        mono: col.mono,
      }))

      const exportRows: ExportCellValue[][] = (report.data as any[]).map(
        (row) =>
          columns.map((col) => ({
            value: this.formatCellValue(row[col.key], col),
            numeric: col.align === 'right',
            mono: col.mono,
          })),
      )

      const csv = this.exportService.generateCsv(exportColumns, exportRows)

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.csv"`,
      )
      res.send(csv)
      return
    }

    if (query.format === 'pdf') {
      const context = this.buildPdfContext(report, columns)
      const pdfBuffer = await this.exportService.generatePdf(context)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.pdf"`,
      )
      res.send(pdfBuffer)
      return
    }

    throw new BadRequestException(`Unsupported export format: ${query.format}`)
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Return column definitions for a report, or null if not yet defined.
   */
  private getColumnsForReport(slug: string): ColumnDef[] | null {
    return REPORT_COLUMNS[slug] ?? null
  }

  /**
   * Build the ExportContext for PDF generation from report data and column defs.
   */
  private buildPdfContext(
    report: {
      reportSlug: string
      reportName: string
      dateRange: { startDate: string; endDate: string }
      viewScope: 'my' | 'agency'
      data: any[]
      summary?: Record<string, number | string>
    },
    columns: ColumnDef[],
  ): ExportContext {
    const exportColumns: ExportColumnDef[] = columns.map((col) => ({
      label: col.header,
      numeric: col.align === 'right',
      mono: col.mono,
    }))

    const exportRows: ExportCellValue[][] = report.data.map((row) =>
      columns.map((col) => ({
        value: this.formatCellValue(row[col.key], col),
        numeric: col.align === 'right',
        mono: col.mono,
      })),
    )

    // Build summary items from the report summary if available
    const summaryItems: SummaryItem[] = report.summary
      ? Object.entries(report.summary).map(([label, value]) => ({
          label,
          value: String(value),
        }))
      : []

    // Format date range label
    const dateRangeLabel =
      report.dateRange.startDate && report.dateRange.endDate
        ? `${report.dateRange.startDate} to ${report.dateRange.endDate}`
        : undefined

    const now = new Date()
    const generatedAt = now.toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })

    return {
      reportName: report.reportName,
      dateRangeLabel,
      viewScopeLabel: report.viewScope === 'my' ? 'My Sales' : 'Agency-Wide',
      companyName: 'Phoenix Voyages',
      ticoRegistration: '50017089',
      generatedAt,
      columns: exportColumns,
      rows: exportRows,
      summaryItems: summaryItems.length > 0 ? summaryItems : undefined,
    }
  }

  /**
   * Determine if a column key represents a summable financial or count field.
   */
  private isSummableColumn(key: string): boolean {
    return (
      /[Cc]ents$/.test(key) ||
      /[Pp]rice$/.test(key) ||
      /[Cc]ount$/.test(key)
    )
  }

  /**
   * Determine if a column key represents an averageable field (rates, scores).
   */
  private isAverageableColumn(key: string): boolean {
    return /[Rr]ate$/.test(key) || /[Ss]core$/.test(key)
  }

  /**
   * Compute column totals from data rows.
   */
  private computeTotals(
    data: any[],
    columns: ColumnDef[],
  ): Record<string, number | null> {
    const totals: Record<string, number | null> = {}

    for (const col of columns) {
      if (this.isSummableColumn(col.key)) {
        totals[col.key] = data.reduce(
          (sum, row) => sum + (Number(row[col.key]) || 0),
          0,
        )
      } else if (this.isAverageableColumn(col.key)) {
        const values = data
          .map((row) => Number(row[col.key]))
          .filter((v) => !isNaN(v))
        totals[col.key] =
          values.length > 0
            ? Math.round(
                (values.reduce((a, b) => a + b, 0) / values.length) * 100,
              ) / 100
            : null
      } else {
        totals[col.key] = null
      }
    }

    return totals
  }

  /**
   * Build structured summary items for frontend summary cards.
   */
  private buildSummaryItems(
    data: any[],
    columns: ColumnDef[],
    totalRows: number,
    existingSummary?: Record<string, number | string>,
  ): { label: string; value: string; format?: 'currency' | 'number' | 'percent' | 'text' }[] {
    const items: { label: string; value: string; format?: 'currency' | 'number' | 'percent' | 'text' }[] = []

    // Use existing summary values if available, converting to structured items
    if (existingSummary) {
      for (const [key, value] of Object.entries(existingSummary)) {
        const isCents =
          /[Cc]ents$/.test(key) || /[Pp]rice$/.test(key)
        const isRate = /[Rr]ate$/.test(key) || /[Ss]core$/.test(key)
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (s) => s.toUpperCase())
          .trim()

        items.push({
          label,
          value: String(value),
          format: isCents ? 'currency' : isRate ? 'percent' : 'number',
        })
      }
    }

    return items
  }

  /**
   * Format a cell value for export (e.g. cents to dollars for price fields).
   */
  private formatCellValue(value: unknown, col: ColumnDef): string {
    if (value === null || value === undefined) return ''

    // Convert cents to dollars for price columns
    if (col.key.endsWith('Cents') && typeof value === 'number') {
      return (value / 100).toLocaleString('en-CA', {
        style: 'currency',
        currency: 'CAD',
      })
    }

    return String(value)
  }
}
