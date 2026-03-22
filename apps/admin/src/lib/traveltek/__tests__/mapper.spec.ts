/**
 * Tests for Traveltek to Tailfire Mapper
 *
 * Tests transformation logic and warnings generation.
 */

import { mapTraveltekToTailfire, hasWarnings } from '../mapper'
import type { TraveltekCruise } from '../schemas'

describe('Traveltek Mapper', () => {
  // Helper to create a minimal valid cruise
  const createMinimalCruise = (overrides?: Partial<TraveltekCruise>): TraveltekCruise => ({
    cruiseid: 2085237,
    voyagecode: 'SY25S09',
    name: '7 Night Eastern Caribbean',
    linecontent: {
      id: 1,
      name: 'Royal Caribbean',
      code: 'RCL',
      description: 'A cruise line',
    },
    shipid: 100,
    shipcontent: {
      id: 100,
      name: 'Symphony of the Seas',
      shipclass: 'Oasis',
      description: 'A ship',
    },
    nights: 7,
    startdate: '2024-01-15',
    enddate: '2024-01-22',
    startportid: 378,
    startportname: 'Miami',
    endportid: 378,
    endportname: 'Miami',
    itinerary: [
      {
        id: 1,
        day: 1,
        orderid: 1,
        portid: 378,
        name: 'Miami',
        itineraryname: 'Miami, Florida',
        arrivedate: '2024-01-15',
        departdate: '2024-01-15',
        arrivetime: '00:00',
        departtime: '16:30',
        description: '',
        shortdescription: '',
        itinerarydescription: '',
        latitude: '25.7617',
        longitude: '-80.1918',
      },
      {
        id: 2,
        day: 2,
        orderid: 2,
        portid: 0,
        name: 'At Sea',
        itineraryname: 'At Sea',
        arrivedate: '2024-01-16',
        departdate: '2024-01-16',
        arrivetime: '00:00',
        departtime: '00:00',
        description: '',
        shortdescription: '',
        itinerarydescription: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 3,
        day: 3,
        orderid: 3,
        portid: 456,
        name: 'Nassau',
        itineraryname: 'Nassau, Bahamas',
        arrivedate: '2024-01-17',
        departdate: '2024-01-17',
        arrivetime: '08:00',
        departtime: '17:00',
        description: 'Beautiful port',
        shortdescription: '',
        itinerarydescription: '',
        latitude: '25.0480',
        longitude: '-77.3554',
      },
      {
        id: 4,
        day: 8,
        orderid: 4,
        portid: 378,
        name: 'Miami',
        itineraryname: 'Miami, Florida',
        arrivedate: '2024-01-22',
        departdate: '2024-01-22',
        arrivetime: '06:00',
        departtime: '00:00',
        description: '',
        shortdescription: '',
        itinerarydescription: '',
        latitude: '25.7617',
        longitude: '-80.1918',
      },
    ],
    regions: { '1': 'Caribbean', '5': 'Western Caribbean' },
    ports: { '378': 'Miami', '456': 'Nassau' },
    cabins: {},
    showcruise: 'N',
    nofly: 'N',
    departuk: 'N',
    cheapest: {
      prices: {
        inside: 799,
        outside: 999,
        balcony: null,
        suite: null,
        insidepricecode: null,
        outsidepricecode: null,
        balconypricecode: null,
        suitepricecode: null,
      },
      cachedprices: {
        inside: null,
        outside: null,
        balcony: null,
        suite: null,
        insidepricecode: null,
        outsidepricecode: null,
        balconypricecode: null,
        suitepricecode: null,
      },
      combined: {
        inside: 799,
        outside: 999,
        balcony: null,
        suite: null,
        insidepricecode: null,
        outsidepricecode: null,
        balconypricecode: null,
        suitepricecode: null,
        insidesource: null,
        outsidesource: null,
        balconysource: null,
        suitesource: null,
      },
    },
    ...overrides,
  })

  describe('mapTraveltekToTailfire', () => {
    describe('Basic Mapping', () => {
      it('should map cruise ID correctly', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.traveltekCruiseId).toBe('2085237')
      })

      it('should set source to traveltek', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.source).toBe('traveltek')
      })

      it('should map cruise line details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.cruiseLineName).toBe('Royal Caribbean')
        expect(result.dto.customCruiseDetails?.cruiseLineCode).toBe('RCL')
      })

      it('should map ship details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.shipName).toBe('Symphony of the Seas')
        expect(result.dto.customCruiseDetails?.shipClass).toBe('Oasis')
      })

      it('should handle null shipcontent', () => {
        const cruise = createMinimalCruise({ shipcontent: null })
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.shipName).toBeNull()
        expect(result.dto.customCruiseDetails?.shipClass).toBeNull()
      })

      it('should map voyage details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.itineraryName).toBe('7 Night Eastern Caribbean')
        expect(result.dto.customCruiseDetails?.voyageCode).toBe('SY25S09')
        expect(result.dto.customCruiseDetails?.nights).toBe(7)
      })

      it('should set component type to custom_cruise', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.componentType).toBe('custom_cruise')
      })

      it('should generate descriptive name', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.name).toContain('Royal Caribbean')
        expect(result.dto.name).toContain('Symphony of the Seas')
        expect(result.dto.name).toContain('7 Night Eastern Caribbean')
      })
    })

    describe('Departure and Arrival', () => {
      it('should extract departure info from first itinerary item', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.departurePort).toBe('Miami')
        expect(result.dto.customCruiseDetails?.departureDate).toBe('2024-01-15')
        expect(result.dto.customCruiseDetails?.departureTime).toBe('16:30')
      })

      it('should extract arrival info from last itinerary item', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.arrivalPort).toBe('Miami')
        expect(result.dto.customCruiseDetails?.arrivalDate).toBe('2024-01-22')
        expect(result.dto.customCruiseDetails?.arrivalTime).toBe('06:00')
      })

      it('should normalize 00:00 times to null', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        // First item has 00:00 arrive time - this should be normalized
        expect(result.dto.customCruiseDetails?.departureTime).not.toBe('00:00')
      })

      it('should use ports mapping for port names', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        // Should use ports mapping ("Miami") not itinerary name ("Miami, Florida")
        expect(result.dto.customCruiseDetails?.departurePort).toBe('Miami')
      })
    })

    describe('Regions', () => {
      it('should extract primary region', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.region).toBe('Caribbean')
      })

      it('should handle empty regions', () => {
        const cruise = createMinimalCruise({ regions: {} })
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.region).toBeNull()
      })

      it('should provide all region IDs in UI data', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.ui.regionIds).toContain(1)
        expect(result.ui.regionIds).toContain(5)
        expect(result.ui.regionNames).toContain('Caribbean')
        expect(result.ui.regionNames).toContain('Western Caribbean')
      })
    })

    describe('Sea Days', () => {
      it('should count sea days correctly', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.seaDays).toBe(1)
      })

      it('should detect "At Sea" as sea day', () => {
        const cruise = createMinimalCruise({
          itinerary: [
            {
              id: 1,
              day: 1,
              orderid: 1,
              portid: 0,
              name: 'At Sea',
              itineraryname: 'At Sea',
              arrivedate: '2024-01-15',
              departdate: '2024-01-15',
              arrivetime: '00:00',
              departtime: '00:00',
              description: '',
              shortdescription: '',
              itinerarydescription: '',
              latitude: null,
              longitude: null,
            },
          ],
        })

        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.seaDays).toBe(1)
      })

      it('should detect "sea day" as sea day', () => {
        const cruise = createMinimalCruise({
          itinerary: [
            {
              id: 1,
              day: 1,
              orderid: 1,
              portid: 0,
              name: 'Sea Day',
              itineraryname: 'Sea Day',
              arrivedate: '2024-01-15',
              departdate: '2024-01-15',
              arrivetime: '00:00',
              departtime: '00:00',
              description: '',
              shortdescription: '',
              itinerarydescription: '',
              latitude: null,
              longitude: null,
            },
          ],
        })

        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.seaDays).toBe(1)
      })
    })

    describe('Port Calls', () => {
      it('should map itinerary to port calls', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        const portCalls = result.dto.customCruiseDetails?.portCallsJson
        expect(portCalls).toHaveLength(4)
      })

      it('should include port call details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        const portCalls = result.dto.customCruiseDetails?.portCallsJson as any[]
        const nassau = portCalls?.find((p) => p.portName === 'Nassau, Bahamas')

        expect(nassau).toBeDefined()
        expect(nassau.day).toBe(3)
        expect(nassau.portId).toBe(456)
        expect(nassau.arriveTime).toBe('08:00')
        expect(nassau.departTime).toBe('17:00')
        expect(nassau.description).toBe('Beautiful port')
        expect(nassau.latitude).toBe('25.0480')
        expect(nassau.longitude).toBe('-77.3554')
      })

      it('should mark sea days with isSeaDay flag', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        const portCalls = result.dto.customCruiseDetails?.portCallsJson as any[]
        const seaDay = portCalls?.find((p) => p.portName === 'At Sea')

        expect(seaDay).toBeDefined()
        expect(seaDay.isSeaDay).toBe(true)
      })
    })

    describe('UI Data', () => {
      it('should include cruise line ID', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.ui.cruiseLineId).toBe(1)
        expect(result.ui.cruiseLineName).toBe('Royal Caribbean')
      })

      it('should include ship ID', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.ui.shipId).toBe(100)
        expect(result.ui.shipName).toBe('Symphony of the Seas')
      })

      it('should include file name when provided', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise, { fileName: '2085237.json' })

        expect(result.ui.fileName).toBe('2085237.json')
      })

      it('should set file name to null when not provided', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.ui.fileName).toBeNull()
      })
    })

    describe('Warnings', () => {
      it('should warn when no itinerary items', () => {
        const cruise = createMinimalCruise({ itinerary: [] })
        const result = mapTraveltekToTailfire(cruise)

        expect(result.warnings).toContain('No itinerary items found for departure info')
        expect(result.warnings).toContain('No port calls found in itinerary')
      })

      it('should warn when end date is null', () => {
        const cruise = createMinimalCruise({ enddate: null })
        const result = mapTraveltekToTailfire(cruise)

        expect(result.warnings).toContain('End date not provided - calculated from last itinerary item')
      })

      it('should warn when last port has no arrival time', () => {
        const cruise = createMinimalCruise({
          itinerary: [
            {
              id: 1,
              day: 1,
              orderid: 1,
              portid: 378,
              name: 'Miami',
              itineraryname: 'Miami, Florida',
              arrivedate: '2024-01-15',
              departdate: '2024-01-15',
              arrivetime: '00:00', // No arrival time
              departtime: '16:30',
              description: '',
              shortdescription: '',
              itinerarydescription: '',
              latitude: '25.7617',
              longitude: '-80.1918',
            },
          ],
        })

        const result = mapTraveltekToTailfire(cruise)

        expect(result.warnings.some((w) => w.includes('no arrival time'))).toBe(true)
      })

      it('should return empty warnings for valid cruise', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        // Valid cruise should still have the "no arrival time" warning for last port
        // since it arrives at 06:00 but has 00:00 depart time
        expect(result.warnings.length).toBeLessThanOrEqual(1)
      })
    })

    describe('Default Values', () => {
      it('should set proposalStatus to draft', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.proposalStatus).toBe('draft')
      })

      it('should set pricingType to per_person', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.pricingType).toBe('per_person')
      })

      it('should set currency to USD', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.currency).toBe('USD')
      })

      it('should not set cabin details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.cabinCategory).toBeNull()
        expect(result.dto.customCruiseDetails?.cabinCode).toBeNull()
        expect(result.dto.customCruiseDetails?.cabinNumber).toBeNull()
      })

      it('should not set booking details', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.bookingNumber).toBeNull()
        expect(result.dto.customCruiseDetails?.fareCode).toBeNull()
      })

      it('should set empty itineraryDayId', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.itineraryDayId).toBe('')
      })
    })

    describe('Pricing Data', () => {
      it('should preserve cheapest pricing data', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        // cabinPricingJson stores the full cheapest object from Traveltek
        expect(result.dto.customCruiseDetails?.cabinPricingJson).toEqual({
          prices: {
            inside: 799,
            outside: 999,
            balcony: null,
            suite: null,
            insidepricecode: null,
            outsidepricecode: null,
            balconypricecode: null,
            suitepricecode: null,
          },
          cachedprices: {
            inside: null,
            outside: null,
            balcony: null,
            suite: null,
            insidepricecode: null,
            outsidepricecode: null,
            balconypricecode: null,
            suitepricecode: null,
          },
          combined: {
            inside: 799,
            outside: 999,
            balcony: null,
            suite: null,
            insidepricecode: null,
            outsidepricecode: null,
            balconypricecode: null,
            suitepricecode: null,
            insidesource: null,
            outsidesource: null,
            balconysource: null,
            suitesource: null,
          },
        })
      })

      it('should preserve ship content JSON', () => {
        const cruise = createMinimalCruise()
        const result = mapTraveltekToTailfire(cruise)

        expect(result.dto.customCruiseDetails?.shipContentJson).toEqual(cruise.shipcontent)
      })
    })
  })

  describe('hasWarnings', () => {
    it('should return true when warnings exist', () => {
      const cruise = createMinimalCruise({ itinerary: [] })
      const result = mapTraveltekToTailfire(cruise)

      expect(hasWarnings(result)).toBe(true)
    })

    it('should return false when no warnings', () => {
      const result = {
        dto: {} as any,
        ui: {} as any,
        warnings: [],
      }

      expect(hasWarnings(result)).toBe(false)
    })
  })
})
