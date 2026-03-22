/**
 * Port Info Validation Schema Tests
 *
 * Tests for port info form Zod schema and default value hydration.
 */

import { describe, it, expect } from 'vitest'
import { portInfoFormSchema, toPortInfoDefaults, toPortInfoApiPayload } from '../port-info-validation'

describe('portInfoFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      itineraryDayId: 'day-123',
      componentType: 'port_info' as const,
      name: 'Nassau Port',
      description: 'A beautiful Caribbean port',
      status: 'confirmed' as const,
      portInfoDetails: {
        portName: 'Nassau, Bahamas',
        portLocation: 'Caribbean',
        arrivalDate: '2025-01-15',
        arrivalTime: '08:00',
        departureDate: '2025-01-15',
        departureTime: '17:00',
        tenderRequired: false,
      },
    }

    const result = portInfoFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.portInfoDetails.portName).toBe('Nassau, Bahamas')
      expect(result.data.portInfoDetails.tenderRequired).toBe(false)
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects missing required fields', () => {
    const result = portInfoFormSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldPaths = result.error.issues.map((i) => i.path.join('.'))
      expect(fieldPaths).toContain('itineraryDayId')
    }
  })

  it('rejects empty port name', () => {
    const result = portInfoFormSchema.safeParse({
      itineraryDayId: 'day-123',
      portInfoDetails: {
        portName: '',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'portInfoDetails.portName'
      )
      expect(nameError).toBeDefined()
      expect(nameError?.message).toBe('Port name is required')
    }
  })

  // ============================================================================
  // Boolean Fields Tests
  // ============================================================================

  it('handles tenderRequired boolean correctly', () => {
    const resultTrue = portInfoFormSchema.safeParse({
      itineraryDayId: 'day-123',
      portInfoDetails: {
        portName: 'Test Port',
        tenderRequired: true,
      },
    })

    expect(resultTrue.success).toBe(true)
    if (resultTrue.success) {
      expect(resultTrue.data.portInfoDetails.tenderRequired).toBe(true)
    }

    const resultFalse = portInfoFormSchema.safeParse({
      itineraryDayId: 'day-123',
      portInfoDetails: {
        portName: 'Test Port',
        tenderRequired: false,
      },
    })

    expect(resultFalse.success).toBe(true)
    if (resultFalse.success) {
      expect(resultFalse.data.portInfoDetails.tenderRequired).toBe(false)
    }
  })

  // ============================================================================
  // Status Tests
  // ============================================================================

  it('accepts valid status values', () => {
    const statuses = ['proposed', 'confirmed', 'cancelled']

    for (const status of statuses) {
      const result = portInfoFormSchema.safeParse({
        itineraryDayId: 'day-123',
        portInfoDetails: {
          portName: 'Test Port',
        },
        status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = portInfoFormSchema.safeParse({
      itineraryDayId: 'day-123',
      portInfoDetails: {
        portName: 'Test Port',
      },
      status: 'invalid_status',
    })

    expect(result.success).toBe(false)
  })

  // ============================================================================
  // Optional Fields Tests
  // ============================================================================

  it('handles all optional fields', () => {
    const result = portInfoFormSchema.safeParse({
      itineraryDayId: 'day-123',
      portInfoDetails: {
        portName: 'Full Port Info',
        portLocation: 'Caribbean',
        arrivalDate: '2025-01-15',
        arrivalTime: '07:00',
        departureDate: '2025-01-15',
        departureTime: '18:00',
        timezone: 'America/Nassau',
        dockName: 'Prince George Wharf',
        address: '123 Port Street',
        phone: '+1-242-555-1234',
        website: 'https://nassauport.com',
        excursionNotes: 'Great snorkeling nearby',
        tenderRequired: true,
        specialRequests: 'Early departure',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.portInfoDetails.dockName).toBe('Prince George Wharf')
      expect(result.data.portInfoDetails.excursionNotes).toBe('Great snorkeling nearby')
    }
  })
})

describe('toPortInfoDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toPortInfoDefaults(null)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.componentType).toBe('port_info')
    expect(defaults.name).toBe('')
    expect(defaults.portInfoDetails.portName).toBe('')
    expect(defaults.portInfoDetails.tenderRequired).toBe(false)
    expect(defaults.portInfoDetails.arrivalTime).toBe('08:00')
    expect(defaults.portInfoDetails.departureTime).toBe('18:00')
  })

  it('respects dayDate parameter for arrival/departure dates', () => {
    const dayDate = '2025-06-15'
    const defaults = toPortInfoDefaults(null, dayDate)

    expect(defaults.portInfoDetails.arrivalDate).toBe('2025-06-15')
    expect(defaults.portInfoDetails.departureDate).toBe('2025-06-15')
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      itineraryDayId: 'day-456',
      name: 'Loaded Port',
      description: 'From server',
      status: 'confirmed' as const,
      portInfoDetails: {
        portName: 'Server Port',
        portLocation: 'Mediterranean',
        arrivalTime: '06:00',
        departureTime: '20:00',
        tenderRequired: true,
        dockName: 'Main Dock',
      },
    }

    const defaults = toPortInfoDefaults(serverData as any)

    expect(defaults.itineraryDayId).toBe('day-456')
    expect(defaults.name).toBe('Loaded Port')
    expect(defaults.portInfoDetails.portName).toBe('Server Port')
    expect(defaults.portInfoDetails.portLocation).toBe('Mediterranean')
    expect(defaults.portInfoDetails.arrivalTime).toBe('06:00')
    expect(defaults.portInfoDetails.departureTime).toBe('20:00')
    expect(defaults.portInfoDetails.tenderRequired).toBe(true)
    expect(defaults.portInfoDetails.dockName).toBe('Main Dock')
  })

  it('handles undefined server payload', () => {
    const defaults = toPortInfoDefaults(undefined)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.portInfoDetails.portName).toBe('')
  })

  it('merges server data with defaults for missing fields', () => {
    const serverData = {
      itineraryDayId: 'day-partial',
      portInfoDetails: {
        portName: 'Partial Port',
        // Missing many optional fields
      },
    }

    const defaults = toPortInfoDefaults(serverData as any)

    expect(defaults.portInfoDetails.portName).toBe('Partial Port')
    expect(defaults.portInfoDetails.arrivalTime).toBe('08:00') // Default
    expect(defaults.portInfoDetails.departureTime).toBe('18:00') // Default
    expect(defaults.portInfoDetails.tenderRequired).toBe(false) // Default
  })
})

describe('toPortInfoApiPayload', () => {
  it('maps form data to API payload correctly', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'port_info' as const,
      name: 'Test Port',
      description: 'A test port',
      proposalStatus: 'draft' as const,
      portInfoDetails: {
        portName: 'Nassau, Bahamas',
        portLocation: 'Caribbean',
        arrivalDate: '2025-01-15',
        arrivalTime: '08:00',
        departureDate: '2025-01-15',
        departureTime: '17:00',
        timezone: 'America/Nassau',
        dockName: 'Prince George Wharf',
        address: '123 Port St',
        coordinates: { lat: 25.0343, lng: -77.3963 },
        phone: '555-1234',
        website: 'https://port.com',
        excursionNotes: 'Great beaches',
        tenderRequired: false,
        specialRequests: 'None',
      },
    }

    const payload = toPortInfoApiPayload(formData)

    expect(payload.itineraryDayId).toBe('day-123')
    expect(payload.componentType).toBe('port_info')
    expect(payload.name).toBe('Nassau, Bahamas') // Auto-named from portName
    expect(payload.portInfoDetails!.portName).toBe('Nassau, Bahamas')
    expect(payload.portInfoDetails!.tenderRequired).toBe(false)
    expect(payload.portInfoDetails!.coordinates).toEqual({ lat: 25.0343, lng: -77.3963 })
  })

  it('handles minimal form data', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'port_info' as const,
      name: '',
      description: '',
      proposalStatus: 'draft' as const,
      portInfoDetails: {
        portName: 'Minimal Port',
        portLocation: '',
        arrivalDate: null,
        arrivalTime: '08:00',
        departureDate: null,
        departureTime: '18:00',
        timezone: '',
        dockName: '',
        address: '',
        coordinates: null,
        phone: '',
        website: '',
        excursionNotes: '',
        tenderRequired: false,
        specialRequests: '',
      },
    }

    const payload = toPortInfoApiPayload(formData)

    expect(payload.name).toBe('Minimal Port')
    expect(payload.portInfoDetails!.arrivalDate).toBeNull()
    expect(payload.portInfoDetails!.coordinates).toBeNull()
  })
})
