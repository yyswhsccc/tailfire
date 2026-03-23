/**
 * ReportExportService
 *
 * Generates PDF (landscape letter) and CSV exports for reporting.
 *
 * IMPORTANT: The Handlebars template is inlined as a constant string rather than
 * loaded from the .hbs file at runtime. nest-cli.json uses SWC with no asset
 * copying configured, so `fs.readFileSync` against .hbs files would fail in
 * production dist builds.
 *
 * The authoritative design reference lives alongside this file at:
 *   reporting/export/templates/report-landscape.hbs
 *
 * Keep that file and LANDSCAPE_TEMPLATE in sync when updating the template design.
 */

import { Injectable } from '@nestjs/common'
import * as Handlebars from 'handlebars'
import { PuppeteerPdfService } from '../../document-render/puppeteer-pdf.service'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportColumnDef {
  /** Display label shown in the table header */
  label: string
  /** Right-align and tabular-nums for financial/numeric values */
  numeric?: boolean
  /** Monospace font for reference numbers, booking codes, etc. */
  mono?: boolean
  /** Optional CSS width hint, e.g. "80px" or "12%" */
  width?: string
}

export interface ExportCellValue {
  /** The rendered string value for this cell */
  value: string
  /** Mirrors ExportColumnDef — set per-cell when it differs from column default */
  numeric?: boolean
  mono?: boolean
  /** Allow this cell to wrap to multiple lines */
  wrap?: boolean
}

export interface SummaryItem {
  /** Short uppercase label, e.g. "Total Bookings" */
  label: string
  /** Formatted value, e.g. "$124,500" or "42" */
  value: string
  /** Optional sub-line, e.g. "vs. $98k last period" */
  sub?: string
}

export interface ExportContext {
  /** E.g. "Commission Summary — March 2026" */
  reportName: string
  /** E.g. "Mar 1 – Mar 31, 2026" */
  dateRangeLabel?: string
  /** E.g. "All Agents" or "Jane Smith" */
  viewScopeLabel?: string
  /** Agency / company name shown in header and page footer */
  companyName: string
  /** TICO registration number, e.g. "50017089" */
  ticoRegistration?: string
  /** Pre-formatted ISO-like string, e.g. "2026-03-23 14:05 EDT" */
  generatedAt: string
  /** Column definitions — drives both PDF headers and CSV column order */
  columns: ExportColumnDef[]
  /**
   * Row data. Each row is an array of ExportCellValue in the same column order
   * as `columns`.
   */
  rows: ExportCellValue[][]
  /** Optional KPI metric boxes rendered above the table */
  summaryItems?: SummaryItem[]
  /**
   * Optional totals row rendered in <tfoot>. Should have the same column count
   * as `columns`; use empty value `{ value: '' }` for non-total cells.
   */
  footerRow?: ExportCellValue[]
}

// ---------------------------------------------------------------------------
// Inline Handlebars template
// (kept in sync with templates/report-landscape.hbs — see file header note)
// ---------------------------------------------------------------------------

const LANDSCAPE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{reportName}}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 0.45in 0.5in 0.45in 0.5in;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 9px;
      color: #1a1a1a;
      line-height: 1.4;
      background: #fff;
    }

    /* ------------------------------------------------------------------ */
    /* HEADER                                                               */
    /* ------------------------------------------------------------------ */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 8px;
      border-bottom: 2px solid #1a1a1a;
      margin-bottom: 8px;
    }

    .report-header-left {
      flex: 1;
    }

    .report-header-right {
      text-align: right;
      font-size: 7.5px;
      color: #555;
      min-width: 180px;
    }

    .report-title {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.2px;
      line-height: 1.2;
    }

    .report-subtitle {
      font-size: 8.5px;
      color: #444;
      margin-top: 3px;
    }

    .report-meta {
      font-size: 7.5px;
      color: #666;
      margin-top: 2px;
    }

    .company-name {
      font-weight: 600;
      font-size: 8.5px;
      color: #1a1a1a;
    }

    /* ------------------------------------------------------------------ */
    /* SUMMARY BAR (optional KPI boxes)                                    */
    /* ------------------------------------------------------------------ */
    .summary-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .summary-item {
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 5px 8px;
      min-width: 110px;
      flex: 0 0 auto;
    }

    .summary-item-label {
      font-size: 7px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 600;
    }

    .summary-item-value {
      font-size: 12px;
      font-weight: 700;
      color: #1a1a1a;
      font-variant-numeric: tabular-nums;
      margin-top: 2px;
      line-height: 1.2;
    }

    .summary-item-sub {
      font-size: 7px;
      color: #888;
      margin-top: 1px;
    }

    /* ------------------------------------------------------------------ */
    /* DATA TABLE                                                           */
    /* ------------------------------------------------------------------ */
    .data-table-wrapper {
      width: 100%;
      overflow: hidden;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .data-table thead tr {
      background: #f0f0f0;
      border-bottom: 1.5px solid #bbb;
    }

    .data-table thead th {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #333;
      padding: 4px 5px;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .data-table thead th.col-numeric {
      text-align: right;
    }

    .data-table thead th.col-mono {
      font-family: 'Courier New', Courier, monospace;
    }

    .data-table tbody tr {
      border-bottom: 0.5px solid #e8e8e8;
    }

    .data-table tbody tr:nth-child(even) {
      background: #fafafa;
    }

    .data-table tbody td {
      font-size: 8.5px;
      padding: 3.5px 5px;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
    }

    .data-table tbody td.col-numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .data-table tbody td.col-mono {
      font-family: 'Courier New', Courier, monospace;
      font-size: 7.5px;
      color: #444;
    }

    .data-table tbody td.col-wrap {
      white-space: normal;
      word-break: break-word;
    }

    /* ------------------------------------------------------------------ */
    /* FOOTER ROW (totals)                                                  */
    /* ------------------------------------------------------------------ */
    .data-table tfoot tr {
      background: #f0f0f0;
      border-top: 1.5px solid #aaa;
    }

    .data-table tfoot td {
      font-size: 8.5px;
      font-weight: 700;
      padding: 4px 5px;
      color: #1a1a1a;
    }

    .data-table tfoot td.col-numeric {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* ------------------------------------------------------------------ */
    /* EMPTY STATE                                                          */
    /* ------------------------------------------------------------------ */
    .empty-state {
      text-align: center;
      padding: 24px;
      color: #888;
      font-size: 9px;
      font-style: italic;
    }

    /* ------------------------------------------------------------------ */
    /* PAGE FOOTER                                                          */
    /* ------------------------------------------------------------------ */
    .page-footer {
      position: fixed;
      bottom: 0.2in;
      left: 0.5in;
      right: 0.5in;
      display: flex;
      justify-content: space-between;
      font-size: 7px;
      color: #aaa;
      border-top: 0.5px solid #ddd;
      padding-top: 3px;
    }

    /* ------------------------------------------------------------------ */
    /* PAGE BREAK HINTS                                                     */
    /* ------------------------------------------------------------------ */
    tr {
      page-break-inside: avoid;
    }

    thead {
      display: table-header-group;
    }

    tfoot {
      display: table-footer-group;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="report-header">
    <div class="report-header-left">
      <div class="report-title">{{reportName}}</div>
      {{#if dateRangeLabel}}
        <div class="report-subtitle">{{dateRangeLabel}}{{#if viewScopeLabel}} &nbsp;·&nbsp; {{viewScopeLabel}}{{/if}}</div>
      {{/if}}
    </div>
    <div class="report-header-right">
      <div class="company-name">{{companyName}}</div>
      {{#if ticoRegistration}}
        <div>TICO Reg. {{ticoRegistration}}</div>
      {{/if}}
      <div>Generated {{generatedAt}}</div>
    </div>
  </div>

  <!-- SUMMARY BAR (only rendered when summaryItems is non-empty) -->
  {{#if summaryItems.length}}
    <div class="summary-bar">
      {{#each summaryItems}}
        <div class="summary-item">
          <div class="summary-item-label">{{this.label}}</div>
          <div class="summary-item-value">{{this.value}}</div>
          {{#if this.sub}}<div class="summary-item-sub">{{this.sub}}</div>{{/if}}
        </div>
      {{/each}}
    </div>
  {{/if}}

  <!-- DATA TABLE -->
  <div class="data-table-wrapper">
    {{#if rows.length}}
      <table class="data-table">
        <thead>
          <tr>
            {{#each columns}}
              <th class="{{#if this.numeric}}col-numeric{{/if}}{{#if this.mono}} col-mono{{/if}}" style="{{#if this.width}}width:{{this.width}};{{/if}}">
                {{this.label}}
              </th>
            {{/each}}
          </tr>
        </thead>
        <tbody>
          {{#each rows}}
            <tr>
              {{#each this}}
                <td class="{{#if this.numeric}}col-numeric{{/if}}{{#if this.mono}} col-mono{{/if}}{{#if this.wrap}} col-wrap{{/if}}">
                  {{this.value}}
                </td>
              {{/each}}
            </tr>
          {{/each}}
        </tbody>
        {{#if footerRow.length}}
          <tfoot>
            <tr>
              {{#each footerRow}}
                <td class="{{#if this.numeric}}col-numeric{{/if}}">{{this.value}}</td>
              {{/each}}
            </tr>
          </tfoot>
        {{/if}}
      </table>
    {{else}}
      <div class="empty-state">No data matches the selected filters.</div>
    {{/if}}
  </div>

  <!-- PAGE FOOTER -->
  <div class="page-footer">
    <span>{{companyName}}{{#if ticoRegistration}} &nbsp;·&nbsp; TICO {{ticoRegistration}}{{/if}}</span>
    <span>{{reportName}} &nbsp;·&nbsp; {{generatedAt}}</span>
  </div>

</body>
</html>`

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReportExportService {
  /** Compiled Handlebars template — built once at module init time */
  private readonly compiledTemplate: HandlebarsTemplateDelegate<ExportContext>

  constructor(private readonly puppeteer: PuppeteerPdfService) {
    this.compiledTemplate = Handlebars.compile(LANDSCAPE_TEMPLATE)
  }

  // -------------------------------------------------------------------------
  // PDF
  // -------------------------------------------------------------------------

  /**
   * Render `context` into a landscape letter PDF buffer via Puppeteer.
   *
   * The returned buffer is suitable for streaming as `application/pdf`
   * or uploading to object storage.
   */
  async generatePdf(context: ExportContext): Promise<Buffer> {
    const html = this.compiledTemplate(context)
    return this.puppeteer.renderHtmlToPdf(html)
  }

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------

  /**
   * Build a UTF-8 CSV string from the provided columns and rows.
   *
   * Values are quoted only when necessary (contains comma, double-quote,
   * newline, or carriage return). Double-quotes within values are escaped
   * by doubling them per RFC 4180.
   *
   * @param columns - Column definitions; `label` is used as the header row.
   * @param rows    - Row data in the same column order as `columns`.
   * @returns       - UTF-8 CSV string (no BOM; callers may prepend \uFEFF for Excel).
   */
  generateCsv(columns: ExportColumnDef[], rows: ExportCellValue[][]): string {
    const lines: string[] = []

    // Header row
    lines.push(columns.map((col) => this.csvCell(col.label)).join(','))

    // Data rows
    for (const row of rows) {
      const cells = row.map((cell) => this.csvCell(cell.value))
      // Pad or trim to column count for safety
      while (cells.length < columns.length) cells.push('')
      lines.push(cells.slice(0, columns.length).join(','))
    }

    return lines.join('\r\n')
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Wrap a cell value in double quotes if it contains any RFC 4180 special
   * characters. Always escapes embedded double-quotes by doubling them.
   */
  private csvCell(value: string): string {
    const needsQuote = /[",\r\n]/.test(value)
    const escaped = value.replace(/"/g, '""')
    return needsQuote ? `"${escaped}"` : escaped
  }
}
