import type { ContactImportRow } from '@tailfire/shared-types/api'
import { splitFullName } from './column-detection'

// ============================================================================
// Date normalization
// ============================================================================

/**
 * Parse common date formats and return ISO YYYY-MM-DD, or null if unparseable.
 *
 * Supported formats:
 *   - YYYY-MM-DD  (ISO, pass-through)
 *   - MM/DD/YYYY  (US)
 *   - DD/MM/YYYY  (European — only when day > 12 disambiguates, otherwise treated as MM/DD)
 *   - DD-MMM-YYYY (e.g. 15-Jan-2000)
 *   - Excel serial numbers (e.g. 44927)
 */
export function normalizeDate(value: string): string | null {
  if (!value || typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // Excel serial number: a pure integer (SheetJS returns these for date cells)
  if (/^\d{4,6}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10)
    // Sanity check: Excel dates start at 1 (Jan 1, 1900). Serial 60 is a known
    // leap-year bug date in Excel; skip it. Cap at reasonable range.
    if (serial < 1 || serial > 100000) return null
    const date = new Date((serial - 25569) * 86400000)
    if (isNaN(date.getTime())) return null
    return toISODate(date)
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return validateAndFormat(parseInt(y), parseInt(m), parseInt(d))
  }

  // DD-MMM-YYYY  (e.g. 15-Jan-2000 or 15-January-2000)
  const dmmmMatch = trimmed.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{4})$/)
  if (dmmmMatch) {
    const [, d, mon, y] = dmmmMatch
    const month = parseMonthName(mon)
    if (month !== null) {
      return validateAndFormat(parseInt(y), month, parseInt(d))
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY or MM-DD-YYYY etc.
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (slashMatch) {
    const [, first, second, y] = slashMatch
    const a = parseInt(first)
    const b = parseInt(second)
    const year = parseInt(y)

    // If first > 12, it must be a day (DD/MM/YYYY)
    if (a > 12) {
      return validateAndFormat(year, b, a)
    }
    // Otherwise default to MM/DD/YYYY (North American convention)
    return validateAndFormat(year, a, b)
  }

  // YYYY/MM/DD
  const ymdSlash = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymdSlash) {
    const [, y, m, d] = ymdSlash
    return validateAndFormat(parseInt(y), parseInt(m), parseInt(d))
  }

  return null
}

function toISODate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function validateAndFormat(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (year < 1900 || year > 2100) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (isNaN(date.getTime())) return null
  // Verify no date-rollover (e.g. Feb 31)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null
  }
  return toISODate(date)
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function parseMonthName(name: string): number | null {
  return MONTH_NAMES[name.toLowerCase()] ?? null
}

// ============================================================================
// Phone normalization
// ============================================================================

/**
 * Strip formatting characters from a phone number.
 * Keeps leading + and all digits. Returns null if empty after stripping.
 */
export function normalizePhone(value: string): string | null {
  if (!value || typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // Keep the leading + if present, then keep only digits
  const hasPlus = trimmed.startsWith('+')
  const digitsOnly = trimmed.replace(/\D/g, '')

  if (!digitsOnly) return null

  return hasPlus ? `+${digitsOnly}` : digitsOnly
}

// ============================================================================
// Country normalization
// ============================================================================

const COUNTRY_MAP: Record<string, string> = {
  // Canada
  'canada': 'CAN',
  'ca': 'CAN',

  // United States
  'united states': 'USA',
  'united states of america': 'USA',
  'us': 'USA',
  'usa': 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'america': 'USA',

  // United Kingdom
  'united kingdom': 'GBR',
  'uk': 'GBR',
  'great britain': 'GBR',
  'england': 'GBR',
  'scotland': 'GBR',
  'wales': 'GBR',

  // Common European
  'france': 'FRA',
  'fr': 'FRA',
  'germany': 'DEU',
  'de': 'DEU',
  'deutschland': 'DEU',
  'italy': 'ITA',
  'it': 'ITA',
  'italia': 'ITA',
  'spain': 'ESP',
  'es': 'ESP',
  'espana': 'ESP',
  'españa': 'ESP',
  'portugal': 'PRT',
  'pt': 'PRT',
  'netherlands': 'NLD',
  'nl': 'NLD',
  'holland': 'NLD',
  'belgium': 'BEL',
  'be': 'BEL',
  'belgique': 'BEL',
  'switzerland': 'CHE',
  'ch': 'CHE',
  'suisse': 'CHE',
  'austria': 'AUT',
  'at': 'AUT',
  'sweden': 'SWE',
  'se': 'SWE',
  'norway': 'NOR',
  'no': 'NOR',
  'denmark': 'DNK',
  'dk': 'DNK',
  'finland': 'FIN',
  'fi': 'FIN',
  'poland': 'POL',
  'pl': 'POL',
  'czech republic': 'CZE',
  'czechia': 'CZE',
  'cz': 'CZE',
  'greece': 'GRC',
  'gr': 'GRC',
  'turkey': 'TUR',
  'tr': 'TUR',
  'ireland': 'IRL',
  'ie': 'IRL',

  // Asia / Pacific
  'australia': 'AUS',
  'au': 'AUS',
  'new zealand': 'NZL',
  'nz': 'NZL',
  'japan': 'JPN',
  'jp': 'JPN',
  'china': 'CHN',
  'cn': 'CHN',
  "people's republic of china": 'CHN',
  'hong kong': 'HKG',
  'hk': 'HKG',
  'singapore': 'SGP',
  'sg': 'SGP',
  'south korea': 'KOR',
  'korea': 'KOR',
  'kr': 'KOR',
  'india': 'IND',
  'in': 'IND',
  'thailand': 'THA',
  'th': 'THA',
  'indonesia': 'IDN',
  'id': 'IDN',
  'malaysia': 'MYS',
  'my': 'MYS',
  'philippines': 'PHL',
  'ph': 'PHL',
  'vietnam': 'VNM',
  'vn': 'VNM',
  'taiwan': 'TWN',
  'tw': 'TWN',

  // Americas
  'mexico': 'MEX',
  'mx': 'MEX',
  'brasil': 'BRA',
  'brazil': 'BRA',
  'br': 'BRA',
  'argentina': 'ARG',
  'ar': 'ARG',
  'chile': 'CHL',
  'cl': 'CHL',
  'colombia': 'COL',
  'co': 'COL',
  'peru': 'PER',
  'pe': 'PER',
  'cuba': 'CUB',
  'cu': 'CUB',
  'jamaica': 'JAM',
  'jm': 'JAM',
  'bahamas': 'BHS',
  'bs': 'BHS',
  'barbados': 'BRB',
  'bb': 'BRB',
  'trinidad': 'TTO',
  'trinidad and tobago': 'TTO',
  'tt': 'TTO',
  'costa rica': 'CRI',
  'cr': 'CRI',
  'panama': 'PAN',
  'pa': 'PAN',

  // Middle East / Africa
  'israel': 'ISR',
  'il': 'ISR',
  'united arab emirates': 'ARE',
  'uae': 'ARE',
  'ae': 'ARE',
  'saudi arabia': 'SAU',
  'sa': 'SAU',
  'egypt': 'EGY',
  'eg': 'EGY',
  'morocco': 'MAR',
  'ma': 'MAR',
  'south africa': 'ZAF',
  'za': 'ZAF',
  'kenya': 'KEN',
  'ke': 'KEN',
  'nigeria': 'NGA',
  'ng': 'NGA',
  'ghana': 'GHA',
  'gh': 'GHA',
  'ethiopia': 'ETH',
  'et': 'ETH',
  'tanzania': 'TZA',
  'tz': 'TZA',
}

/**
 * Map a country name or code to its ISO 3166-1 alpha-3 code.
 * - Already-3-letter codes are returned uppercased.
 * - Already-2-letter codes are looked up in the map.
 * - Unrecognized values return null.
 */
export function normalizeCountry(value: string): string | null {
  if (!value || typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // Already a 3-letter code (e.g. "CAN", "USA")
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  const lower = trimmed.toLowerCase()
  return COUNTRY_MAP[lower] ?? null
}

// ============================================================================
// Row normalization
// ============================================================================

/**
 * Apply field mapping + normalization to produce a clean ContactImportRow.
 *
 * @param rawRow       - Raw key/value pairs from the parsed file
 * @param mapping      - Map of { headerName: tailfireFieldKey } from detectColumnMapping()
 * @param fullNameHeader - Optional header that was detected as a "full name" column
 */
export function normalizeRow(
  rawRow: Record<string, string>,
  mapping: Record<string, string>,
  fullNameHeader?: string,
): ContactImportRow {
  const row: ContactImportRow = {}

  // If a full-name header is present, split it first (individual name fields can override)
  if (fullNameHeader && rawRow[fullNameHeader]) {
    const { firstName, lastName } = splitFullName(rawRow[fullNameHeader])
    if (firstName) row.firstName = firstName
    if (lastName) row.lastName = lastName
  }

  for (const [header, field] of Object.entries(mapping)) {
    if (field === 'fullName') continue // already handled above

    const raw = rawRow[header]
    if (raw === undefined || raw === null) continue
    const value = String(raw).trim()
    if (!value) continue

    switch (field as keyof ContactImportRow) {
      case 'firstName':
        row.firstName = value
        break
      case 'lastName':
        row.lastName = value
        break
      case 'email':
        row.email = value.toLowerCase()
        break
      case 'phone':
        row.phone = normalizePhone(value) ?? undefined
        break
      case 'dateOfBirth':
        row.dateOfBirth = normalizeDate(value) ?? undefined
        break
      case 'passportExpiry':
        row.passportExpiry = normalizeDate(value) ?? undefined
        break
      case 'country':
        row.country = normalizeCountry(value) ?? undefined
        break
      case 'passportCountry':
        row.passportCountry = normalizeCountry(value) ?? undefined
        break
      case 'addressLine1':
        row.addressLine1 = value
        break
      case 'addressLine2':
        row.addressLine2 = value
        break
      case 'city':
        row.city = value
        break
      case 'province':
        row.province = value
        break
      case 'postalCode':
        row.postalCode = value
        break
      case 'passportNumber':
        row.passportNumber = value
        break
    }
  }

  return row
}
