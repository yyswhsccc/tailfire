const FIELD_MAPPINGS: Record<string, string[]> = {
  firstName: ['first name', 'first', 'prénom', 'prenom', 'given name'],
  lastName: ['last name', 'last', 'nom', 'surname', 'family name'],
  email: ['email', 'e-mail', 'email address', 'courriel', 'mail'],
  phone: ['phone', 'telephone', 'cell', 'mobile', 'téléphone', 'tel'],
  dateOfBirth: ['dob', 'date of birth', 'birthday', 'birth date', 'date de naissance'],
  addressLine1: ['address', 'street', 'address line 1', 'adresse'],
  addressLine2: ['address 2', 'apt', 'suite', 'unit'],
  city: ['city', 'ville'],
  province: ['province', 'state', 'region'],
  postalCode: ['postal code', 'zip', 'zip code', 'code postal'],
  country: ['country', 'pays'],
  passportNumber: ['passport', 'passport number', 'passport #'],
  passportExpiry: ['passport expiry', 'passport exp', 'expiry date'],
  passportCountry: ['passport country', 'issuing country'],
}

const FULL_NAME_HEADERS = ['full name', 'name', 'nom complet', 'nom', 'contact name']

/**
 * Auto-detect column headers → Tailfire field mapping.
 * Returns a map of { headerName: tailfireFieldKey } for all recognized columns.
 * Full-name headers are mapped to the special key "fullName".
 */
export function detectColumnMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}

  for (const header of headers) {
    const normalized = header.trim().toLowerCase()

    // Check full-name headers first
    if (FULL_NAME_HEADERS.includes(normalized)) {
      result[header] = 'fullName'
      continue
    }

    // Check field mappings
    for (const [field, aliases] of Object.entries(FIELD_MAPPINGS)) {
      if (aliases.includes(normalized)) {
        result[header] = field
        break
      }
    }
  }

  return result
}

/**
 * Splits a full name string into firstName and lastName.
 * Handles:
 *   "John Smith"    → { firstName: "John", lastName: "Smith" }
 *   "Smith, John"   → { firstName: "John", lastName: "Smith" }
 *   "John"          → { firstName: "John", lastName: "" }
 *   "John A. Smith" → { firstName: "John A.", lastName: "Smith" }
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()

  if (!trimmed) {
    return { firstName: '', lastName: '' }
  }

  // Detect "Last, First" (comma-separated) format
  if (trimmed.includes(',')) {
    const commaIndex = trimmed.indexOf(',')
    const lastName = trimmed.slice(0, commaIndex).trim()
    const firstName = trimmed.slice(commaIndex + 1).trim()
    return { firstName, lastName }
  }

  // Standard "First [Middle] Last" format
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: '' }
  }

  const lastName = parts[parts.length - 1]!
  const firstName = parts.slice(0, parts.length - 1).join(' ')
  return { firstName, lastName }
}
