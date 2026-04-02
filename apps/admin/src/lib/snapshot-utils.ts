/**
 * Traveler Snapshot Comparison Utilities
 *
 * Pure helper functions for comparing traveler snapshots to detect changes.
 * Used to highlight what information has changed between trip creation and current state.
 */

export type TravelerSnapshot = {
  id: string
  tripId: string
  contactId: string

  // Name fields (at time of snapshot)
  firstName: string | null
  lastName: string | null
  legalFirstName: string | null
  legalLastName: string | null
  middleName: string | null
  preferredName: string | null
  prefix: string | null
  suffix: string | null

  // LGBTQ+ inclusive
  gender: string | null
  pronouns: string | null

  // Contact info
  email: string | null
  phone: string | null
  dateOfBirth: string | null

  // Passport
  passportNumber: string | null
  passportExpiry: string | null
  passportCountry: string | null
  passportIssueDate: string | null
  nationality: string | null

  // TSA Credentials
  redressNumber: string | null
  knownTravelerNumber: string | null

  // Requirements
  dietaryRequirements: string | null
  mobilityRequirements: string | null

  // Travel preferences
  seatPreference: string | null
  cabinPreference: string | null
  floorPreference: string | null

  // Metadata
  snapshotAt: string
  createdAt: string
  updatedAt: string
}

export type Contact = {
  id: string

  // Name fields (current state)
  firstName: string | null
  lastName: string | null
  legalFirstName: string | null
  legalLastName: string | null
  middleName: string | null
  preferredName: string | null
  prefix: string | null
  suffix: string | null

  // LGBTQ+ inclusive
  gender: string | null
  pronouns: string | null

  // Contact info
  email: string | null
  phone: string | null
  dateOfBirth: string | null

  // Passport
  passportNumber: string | null
  passportExpiry: string | null
  passportCountry: string | null
  passportIssueDate: string | null
  nationality: string | null

  // TSA Credentials
  redressNumber: string | null
  knownTravelerNumber: string | null

  // Requirements
  dietaryRequirements: string | null
  mobilityRequirements: string | null

  // Travel preferences
  seatPreference: string | null
  cabinPreference: string | null
  floorPreference: string | null
}

/**
 * Field categories for grouping changes in the UI
 */
export const FIELD_CATEGORIES = {
  name: {
    label: 'Name',
    fields: ['firstName', 'lastName', 'legalFirstName', 'legalLastName', 'middleName', 'preferredName', 'prefix', 'suffix'] as const,
  },
  identity: {
    label: 'Identity',
    fields: ['gender', 'pronouns'] as const,
  },
  contact: {
    label: 'Contact Information',
    fields: ['email', 'phone', 'dateOfBirth'] as const,
  },
  passport: {
    label: 'Passport',
    fields: ['passportNumber', 'passportExpiry', 'passportCountry', 'passportIssueDate', 'nationality'] as const,
  },
  tsa: {
    label: 'TSA Credentials',
    fields: ['redressNumber', 'knownTravelerNumber'] as const,
  },
  requirements: {
    label: 'Special Requirements',
    fields: ['dietaryRequirements', 'mobilityRequirements'] as const,
  },
  preferences: {
    label: 'Travel Preferences',
    fields: ['seatPreference', 'cabinPreference', 'floorPreference'] as const,
  },
} as const

/**
 * Human-readable field labels
 */
export const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  legalFirstName: 'Legal First Name',
  legalLastName: 'Legal Last Name',
  middleName: 'Middle Name',
  preferredName: 'Preferred Name',
  prefix: 'Prefix',
  suffix: 'Suffix',
  gender: 'Gender',
  pronouns: 'Pronouns',
  email: 'Email',
  phone: 'Phone',
  dateOfBirth: 'Date of Birth',
  passportNumber: 'Passport Number',
  passportExpiry: 'Passport Expiry',
  passportCountry: 'Passport Country',
  passportIssueDate: 'Passport Issue Date',
  nationality: 'Nationality',
  redressNumber: 'Redress Number',
  knownTravelerNumber: 'Known Traveler Number',
  dietaryRequirements: 'Dietary Requirements',
  mobilityRequirements: 'Mobility Requirements',
  seatPreference: 'Seat Preference',
  cabinPreference: 'Cabin Preference',
  floorPreference: 'Floor Preference',
}

/**
 * A single field change between snapshot and current state
 */
export type FieldChange = {
  field: string
  label: string
  oldValue: string | null
  newValue: string | null
  category: keyof typeof FIELD_CATEGORIES
}

/**
 * Collection of changes grouped by category
 */
export type SnapshotDiff = {
  hasChanges: boolean
  changes: FieldChange[]
  changesByCategory: Record<keyof typeof FIELD_CATEGORIES, FieldChange[]>
  totalChanges: number
}

/**
 * Compare a snapshot to current contact state and return all detected changes
 */
export function compareSnapshots(
  snapshot: TravelerSnapshot,
  current: Contact
): SnapshotDiff {
  const changes: FieldChange[] = []

  // Iterate through all field categories
  for (const [categoryKey, category] of Object.entries(FIELD_CATEGORIES)) {
    for (const field of category.fields) {
      const oldValue = snapshot[field]
      const newValue = current[field]

      // Normalize null/undefined for comparison (treat undefined as null)
      const normalizedOld = oldValue === undefined ? null : oldValue
      const normalizedNew = newValue === undefined ? null : newValue

      // Detect change (null-safe comparison)
      if (normalizedOld !== normalizedNew) {
        changes.push({
          field,
          label: FIELD_LABELS[field] || field,
          oldValue: normalizedOld,
          newValue: normalizedNew,
          category: categoryKey as keyof typeof FIELD_CATEGORIES,
        })
      }
    }
  }

  // Group changes by category
  const changesByCategory = Object.keys(FIELD_CATEGORIES).reduce((acc, key) => {
    acc[key as keyof typeof FIELD_CATEGORIES] = changes.filter(
      (change) => change.category === key
    )
    return acc
  }, {} as Record<keyof typeof FIELD_CATEGORIES, FieldChange[]>)

  return {
    hasChanges: changes.length > 0,
    changes,
    changesByCategory,
    totalChanges: changes.length,
  }
}

/**
 * Format a field value for display (handles nulls, dates, etc.)
 */
export function formatFieldValue(value: string | null): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  // Check if it's a date string (YYYY-MM-DD or ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      const date = new Date(value)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return value
    }
  }

  return value
}

/**
 * Get a summary description of changes (e.g., "3 changes in Passport, Name")
 */
export function getChangeSummary(diff: SnapshotDiff): string {
  if (!diff.hasChanges) {
    return 'No changes detected'
  }

  const categoriesWithChanges = Object.entries(diff.changesByCategory)
    .filter(([_, changes]) => changes.length > 0)
    .map(([category, changes]) => {
      const label = FIELD_CATEGORIES[category as keyof typeof FIELD_CATEGORIES].label
      return `${changes.length} in ${label}`
    })

  return categoriesWithChanges.join(', ')
}

/**
 * Check if a specific category has changes
 */
export function categoryHasChanges(
  diff: SnapshotDiff,
  category: keyof typeof FIELD_CATEGORIES
): boolean {
  return diff.changesByCategory[category].length > 0
}

/**
 * Get the total number of changes in a category
 */
export function getCategoryChangeCount(
  diff: SnapshotDiff,
  category: keyof typeof FIELD_CATEGORIES
): number {
  return diff.changesByCategory[category].length
}

/**
 * Validation Issue Types
 */
export type ValidationIssueType = 'error' | 'warning'

export type ValidationIssue = {
  field: string
  label: string
  message: string
  type: ValidationIssueType
  category: keyof typeof FIELD_CATEGORIES
}

/**
 * Collection of validation issues
 */
export type ValidationResult = {
  hasIssues: boolean
  issues: ValidationIssue[]
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  totalIssues: number
}

/**
 * Validate contact data for travel readiness
 * Checks for missing required fields and expiring documents
 */
export function validateContactForTravel(
  contact: Contact,
  tripStartDate?: string | null
): ValidationResult {
  const issues: ValidationIssue[] = []

  // Check for missing date of birth (required for most travel)
  if (!contact.dateOfBirth) {
    issues.push({
      field: 'dateOfBirth',
      label: FIELD_LABELS.dateOfBirth!,
      message: 'Date of birth is required for travel documentation',
      type: 'error',
      category: 'contact',
    })
  }

  // Check for missing passport number
  if (!contact.passportNumber) {
    issues.push({
      field: 'passportNumber',
      label: FIELD_LABELS.passportNumber!,
      message: 'Passport number is required for international travel',
      type: 'error',
      category: 'passport',
    })
  }

  // Check for missing passport expiry
  if (!contact.passportExpiry && contact.passportNumber) {
    issues.push({
      field: 'passportExpiry',
      label: FIELD_LABELS.passportExpiry!,
      message: 'Passport expiry date is required',
      type: 'error',
      category: 'passport',
    })
  }

  // Check if passport is expiring within 6 months
  if (contact.passportExpiry) {
    const expiryDate = new Date(contact.passportExpiry)
    const today = new Date()
    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)

    if (expiryDate < today) {
      issues.push({
        field: 'passportExpiry',
        label: FIELD_LABELS.passportExpiry!,
        message: 'Passport has expired',
        type: 'error',
        category: 'passport',
      })
    } else if (expiryDate < sixMonthsFromNow) {
      const monthsUntilExpiry = Math.round(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
      issues.push({
        field: 'passportExpiry',
        label: FIELD_LABELS.passportExpiry!,
        message: `Passport expires in ${monthsUntilExpiry} month${monthsUntilExpiry !== 1 ? 's' : ''}. Many countries require 6 months validity.`,
        type: 'warning',
        category: 'passport',
      })
    }
  }

  // Check if passport will expire before/during trip
  if (contact.passportExpiry && tripStartDate) {
    const expiryDate = new Date(contact.passportExpiry)
    const tripDate = new Date(tripStartDate)

    if (expiryDate < tripDate) {
      issues.push({
        field: 'passportExpiry',
        label: FIELD_LABELS.passportExpiry!,
        message: 'Passport will be expired before trip departure',
        type: 'error',
        category: 'passport',
      })
    }
  }

  // Check for missing passport country
  if (!contact.passportCountry && contact.passportNumber) {
    issues.push({
      field: 'passportCountry',
      label: FIELD_LABELS.passportCountry!,
      message: 'Passport issuing country is required',
      type: 'warning',
      category: 'passport',
    })
  }

  // Separate into errors and warnings
  const errors = issues.filter((issue) => issue.type === 'error')
  const warnings = issues.filter((issue) => issue.type === 'warning')

  return {
    hasIssues: issues.length > 0,
    issues,
    errors,
    warnings,
    totalIssues: issues.length,
  }
}

/**
 * Convert a traveler's contactSnapshot JSONB to the Contact type
 * used by validateContactForTravel. Maps common snapshot field variations.
 */
export function contactFromSnapshot(snapshot: Record<string, any> | null): Contact {
  if (!snapshot) {
    return {
      id: '',
      firstName: null,
      lastName: null,
      legalFirstName: null,
      legalLastName: null,
      middleName: null,
      preferredName: null,
      prefix: null,
      suffix: null,
      gender: null,
      pronouns: null,
      email: null,
      phone: null,
      dateOfBirth: null,
      passportNumber: null,
      passportExpiry: null,
      passportCountry: null,
      passportIssueDate: null,
      nationality: null,
      redressNumber: null,
      knownTravelerNumber: null,
      dietaryRequirements: null,
      mobilityRequirements: null,
      seatPreference: null,
      cabinPreference: null,
      floorPreference: null,
    }
  }

  return {
    id: snapshot.id || '',
    firstName: snapshot.firstName || null,
    lastName: snapshot.lastName || null,
    legalFirstName: snapshot.legalFirstName || null,
    legalLastName: snapshot.legalLastName || null,
    middleName: snapshot.middleName || null,
    preferredName: snapshot.preferredName || null,
    prefix: snapshot.prefix || null,
    suffix: snapshot.suffix || null,
    gender: snapshot.gender || null,
    pronouns: snapshot.pronouns || null,
    email: snapshot.email || null,
    phone: snapshot.phone || null,
    dateOfBirth: snapshot.dateOfBirth || null,
    passportNumber: snapshot.passportNumber || snapshot.passport?.number || null,
    passportExpiry: snapshot.passportExpiry || snapshot.passport?.expiry || null,
    passportCountry: snapshot.passportCountry || snapshot.passport?.country || null,
    passportIssueDate: snapshot.passportIssueDate || null,
    nationality: snapshot.nationality || null,
    redressNumber: snapshot.redressNumber || null,
    knownTravelerNumber: snapshot.knownTravelerNumber || null,
    dietaryRequirements: snapshot.dietaryRequirements || null,
    mobilityRequirements: snapshot.mobilityRequirements || null,
    seatPreference: snapshot.seatPreference || null,
    cabinPreference: snapshot.cabinPreference || null,
    floorPreference: snapshot.floorPreference || null,
  }
}
