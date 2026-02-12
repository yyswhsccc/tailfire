/**
 * Sample Data for Email Template Preview
 *
 * Provides realistic sample data for rendering email templates in preview mode.
 * Used when rendering templates without actual database context.
 */

/**
 * Sample data that maps to template variable keys
 * Format: { [variableKey]: sampleValue }
 */
export const TEMPLATE_SAMPLE_DATA: Record<string, string> = {
  // Contact variables
  'contact.first_name': 'John',
  'contact.last_name': 'Smith',
  'contact.email': 'john.smith@example.com',
  'contact.phone': '+1 (555) 123-4567',

  // Trip variables
  'trip.name': 'Italy Adventure 2026',
  'trip.title': 'Italy Adventure 2026',
  'trip.reference': 'TRP-2026-ABC123',
  'trip.start_date': 'Saturday, April 15, 2026',
  'trip.end_date': 'Sunday, April 25, 2026',
  'trip.destination': 'Rome, Florence, Venice',

  // Activity variables
  'activity.name': 'Colosseum Guided Tour',
  'activity.date': 'Thursday, April 16, 2026',
  'activity.price': 'CA$150.00',
  'activity.description': 'Skip-the-line guided tour of the ancient Colosseum',

  // Agent variables
  'agent.first_name': 'Sarah',
  'agent.last_name': 'Johnson',
  'agent.full_name': 'Sarah Johnson',
  'agent.email': 'sarah.johnson@phoenixvoyages.com',
  'agent.phone': '+1 (555) 987-6543',

  // Business variables
  'business.name': 'Phoenix Voyages',
  'business.phone': '1-800-555-0123',
  'business.email': 'info@phoenixvoyages.com',
  'business.website': 'www.phoenixvoyages.com',
  'business.address': '123 Travel Lane, Toronto, ON M5V 1A1',

  // Payment variables
  'payment.name': 'Final Payment',
  'payment.amount': 'CA$2,500.00',
  'payment.paid_amount': 'CA$1,000.00',
  'payment.remaining': 'CA$1,500.00',
  'payment.due_date': 'Sunday, March 15, 2026',
  'payment.status': 'Pending',
}

/**
 * Categorized sample data for documentation/display purposes
 */
export const CATEGORIZED_SAMPLE_DATA = {
  contact: {
    first_name: 'John',
    last_name: 'Smith',
    email: 'john.smith@example.com',
    phone: '+1 (555) 123-4567',
  },
  trip: {
    name: 'Italy Adventure 2026',
    title: 'Italy Adventure 2026',
    reference: 'TRP-2026-ABC123',
    start_date: 'Saturday, April 15, 2026',
    end_date: 'Sunday, April 25, 2026',
    destination: 'Rome, Florence, Venice',
  },
  activity: {
    name: 'Colosseum Guided Tour',
    date: 'Thursday, April 16, 2026',
    price: 'CA$150.00',
    description: 'Skip-the-line guided tour of the ancient Colosseum',
  },
  agent: {
    first_name: 'Sarah',
    last_name: 'Johnson',
    full_name: 'Sarah Johnson',
    email: 'sarah.johnson@phoenixvoyages.com',
    phone: '+1 (555) 987-6543',
  },
  business: {
    name: 'Phoenix Voyages',
    phone: '1-800-555-0123',
    email: 'info@phoenixvoyages.com',
    website: 'www.phoenixvoyages.com',
    address: '123 Travel Lane, Toronto, ON M5V 1A1',
  },
  payment: {
    name: 'Final Payment',
    amount: 'CA$2,500.00',
    paid_amount: 'CA$1,000.00',
    remaining: 'CA$1,500.00',
    due_date: 'Sunday, March 15, 2026',
    status: 'Pending',
  },
}

/**
 * Extract all variables used in a template text
 */
export function extractVariablesFromTemplate(text: string): string[] {
  const variablePattern = /\{\{([^}]+)\}\}/g
  const matches = Array.from(text.matchAll(variablePattern))
  return Array.from(
    new Set(
      matches
        .map((m) => m[1]?.split('::')[0]?.trim())
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  )
}

/**
 * Render template text with sample data
 * Replaces {{variable}} and {{variable::fallback}} patterns
 */
export function renderWithSampleData(text: string, overrides?: Record<string, string>): string {
  if (!text) return ''

  const data = { ...TEMPLATE_SAMPLE_DATA, ...overrides }

  return text.replace(/\{\{([^}]+)\}\}/g, (_match, variable: string) => {
    const parts = variable.split('::').map((s: string) => s.trim())
    const key = parts[0] || ''
    const fallback = parts[1]
    return data[key] || fallback || `[${key}]`
  })
}

/**
 * Get variables used in template with their sample values
 */
export function getVariablesWithSampleValues(
  subject: string,
  bodyHtml: string,
  bodyText?: string
): Array<{ key: string; value: string; description: string }> {
  const allText = [subject, bodyHtml, bodyText].filter(Boolean).join(' ')
  const variables = extractVariablesFromTemplate(allText)

  const descriptions: Record<string, string> = {
    'contact.first_name': "Contact's first name",
    'contact.last_name': "Contact's last name",
    'contact.email': "Contact's email address",
    'contact.phone': "Contact's phone number",
    'trip.name': 'Trip name',
    'trip.title': 'Trip title',
    'trip.reference': 'Trip reference number',
    'trip.start_date': 'Trip start date',
    'trip.end_date': 'Trip end date',
    'trip.destination': 'Trip destination',
    'activity.name': 'Activity name',
    'activity.date': 'Activity date',
    'activity.price': 'Activity price',
    'activity.description': 'Activity description',
    'agent.first_name': "Agent's first name",
    'agent.last_name': "Agent's last name",
    'agent.full_name': "Agent's full name",
    'agent.email': "Agent's email",
    'agent.phone': "Agent's phone number",
    'business.name': 'Agency name',
    'business.phone': 'Agency phone number',
    'business.email': 'Agency email address',
    'business.website': 'Agency website',
    'business.address': 'Agency address',
    'payment.name': 'Payment item name',
    'payment.amount': 'Total payment amount',
    'payment.paid_amount': 'Amount already paid',
    'payment.remaining': 'Remaining balance due',
    'payment.due_date': 'Payment due date',
    'payment.status': 'Payment status',
  }

  return variables.map((key) => ({
    key,
    value: TEMPLATE_SAMPLE_DATA[key] || `[${key}]`,
    description: descriptions[key] || `Value for ${key}`,
  }))
}
