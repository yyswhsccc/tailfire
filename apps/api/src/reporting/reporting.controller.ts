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
  runReport(
    @Param('slug') slug: string,
    @GetAuthContext() auth: AuthContext,
    @Query() query: ReportQueryDto,
  ) {
    return this.reporting.runReport(slug, auth, query)
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
