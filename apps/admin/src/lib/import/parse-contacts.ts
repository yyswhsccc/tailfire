import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedFileResult {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Parse a CSV or Excel file into a flat list of string-valued rows.
 *
 * - .csv         → Papa Parse (header:true)
 * - .xlsx / .xls → SheetJS (first sheet, sheet_to_json)
 *
 * All cell values are coerced to strings to provide a uniform interface
 * regardless of source format.
 */
export async function parseFile(file: File): Promise<ParsedFileResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (extension === 'csv') {
    return parseCsv(file)
  }

  if (extension === 'xlsx' || extension === 'xls') {
    return parseExcel(file)
  }

  throw new Error(`Unsupported file type: .${extension}. Please upload a .csv, .xlsx, or .xls file.`)
}

// ============================================================================
// CSV parsing (Papa Parse)
// ============================================================================

function parseCsv(file: File): Promise<ParsedFileResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? []
        const rows = results.data.map((row) => stringifyRow(row))
        resolve({ headers, rows })
      },
      error(err) {
        reject(new Error(`CSV parse error: ${err.message}`))
      },
    })
  })
}

// ============================================================================
// Excel parsing (SheetJS)
// ============================================================================

async function parseExcel(file: File): Promise<ParsedFileResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('The Excel file contains no sheets.')
  }

  const sheet = workbook.Sheets[firstSheetName]!

  // Use defval: '' so missing cells become empty strings instead of undefined
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true, // keep raw values (numbers for date serials)
  })

  if (rawRows.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = Object.keys(rawRows[0]!)
  const rows = rawRows.map((row) => stringifyRow(row))

  return { headers, rows }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Coerce all values in a row to strings.
 * Numbers (including Excel date serials) are stringified so that
 * normalizeDate() can detect and handle them.
 */
function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      result[key] = ''
    } else {
      result[key] = String(value)
    }
  }
  return result
}
