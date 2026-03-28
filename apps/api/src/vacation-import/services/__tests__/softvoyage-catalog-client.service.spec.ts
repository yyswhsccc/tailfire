/**
 * SoftvoyageCatalogClientService Unit Tests
 *
 * Tests:
 * - parseGateways: parses "City--xx--CODE" entries correctly
 * - parseDestinations: handles individual/group/separator entries
 * - parseHotels: parses "Name--xx--ID" entries correctly
 * - fetchGateways / fetchDestinations / fetchHotels: delegates to HTTP and parses response
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { of } from 'rxjs'
import {
  SoftvoyageCatalogClientService,
  VcoGateway,
  VcoHotel,
} from '../softvoyage-catalog-client.service'

/**
 * Helper: create an AxiosResponse-like mock (avoids axios import version conflicts)
 */
function mockAxiosResponse<T>(data: T, status = 200): any {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: { headers: {} },
  }
}

describe('SoftvoyageCatalogClientService', () => {
  let service: SoftvoyageCatalogClientService
  let httpService: jest.Mocked<HttpService>
  let configService: jest.Mocked<ConfigService>

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
    } as any

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          SOFTVOYAGE_VCO_BASE_URL: 'https://vco.example.com',
          SOFTVOYAGE_VCO_CODE_AG: 'TEST_AG',
          SOFTVOYAGE_VCO_ALIAS: 'test_alias',
        }
        return values[key] ?? defaultValue ?? ''
      }),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SoftvoyageCatalogClientService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = module.get<SoftvoyageCatalogClientService>(SoftvoyageCatalogClientService)
  })

  // ============================================================================
  // fetchGateways
  // ============================================================================

  describe('fetchGateways', () => {
    it('should parse gateways from VCO response', async () => {
      const rawResponse = [{ gateways: ['Toronto--xx--YYZ', 'Montreal--xx--YUL'] }]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchGateways()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual<VcoGateway>({ name: 'Toronto', airportCode: 'YYZ' })
      expect(result[1]).toEqual<VcoGateway>({ name: 'Montreal', airportCode: 'YUL' })
    })

    it('should call the correct URL with expected query params', async () => {
      const rawResponse = [{ gateways: ['Toronto--xx--YYZ'] }]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      await service.fetchGateways()

      expect(httpService.get).toHaveBeenCalledWith('https://vco.example.com/ajax.cgi', {
        params: {
          action: 'getPackagesGateways',
          code_ag: 'TEST_AG',
          alias: 'test_alias',
          language: 'en',
        },
      })
    })

    it('should return empty array when response has no gateways array', async () => {
      httpService.get.mockReturnValue(of(mockAxiosResponse([])))
      const result = await service.fetchGateways()
      expect(result).toEqual([])
    })

    it('should skip malformed gateway entries missing the separator', async () => {
      const rawResponse = [{ gateways: ['Toronto--xx--YYZ', 'BadEntryNoSeparator', 'Vancouver--xx--YVR'] }]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchGateways()

      expect(result).toHaveLength(2)
      expect(result.map((g) => g.airportCode)).toEqual(['YYZ', 'YVR'])
    })

    it('should trim whitespace from gateway names and codes', async () => {
      const rawResponse = [{ gateways: [' Toronto --xx-- YYZ '] }]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchGateways()

      expect(result[0]).toEqual({ name: 'Toronto', airportCode: 'YYZ' })
    })
  })

  // ============================================================================
  // fetchDestinations
  // ============================================================================

  describe('fetchDestinations', () => {
    it('should split composite IDs into individual destination entries', async () => {
      const rawResponse = [
        {
          destinations: [
            'Cancun--xx--Cancun xxx101,102xxxMX--xx--7,14',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      // Composite ID "101,102" should produce 2 individual entries
      expect(result).toHaveLength(2)
      expect(result[0]!.name).toBe('Cancun')
      expect(result[0]!.id).toBe('101')
      expect(result[0]!.countryCodes).toBe('MX')
      expect(result[0]!.durations).toEqual([7, 14])
      expect(result[0]!.isGroup).toBe(false)
      expect(result[1]!.name).toBe('Cancun')
      expect(result[1]!.id).toBe('102')
    })

    it('should mark destinations starting with "All " as groups', async () => {
      const rawResponse = [
        {
          destinations: [
            'All Mexico--xx--All Mexico xxx201xxxMX,US--xx--7,10,14',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      expect(result[0]!.isGroup).toBe(true)
      expect(result[0]!.name).toBe('All Mexico')
    })

    it('should mark destinations starting with "- " as groups', async () => {
      const rawResponse = [
        {
          destinations: [
            '- Beach Resorts--xx--Beach Resorts xxx301xxxMX--xx--7',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      expect(result[0]!.isGroup).toBe(true)
      expect(result[0]!.name).toBe('- Beach Resorts')
    })

    it('should skip separator entries starting with "--xx--"', async () => {
      const rawResponse = [
        {
          destinations: [
            '--xx-- xxx--xx--',
            'Cancun--xx--Cancun xxx101xxxMX--xx--7',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe('Cancun')
    })

    it('should call the correct URL with gateway_dep param', async () => {
      httpService.get.mockReturnValue(of(mockAxiosResponse([{ destinations: [] }])))

      await service.fetchDestinations('YUL')

      expect(httpService.get).toHaveBeenCalledWith('https://vco.example.com/ajax.cgi', {
        params: {
          action: 'getPackagesDestinations',
          code_ag: 'TEST_AG',
          alias: 'test_alias',
          gateway_dep: 'YUL',
          language: 'en',
        },
      })
    })

    it('should return empty array when response has no destinations array', async () => {
      httpService.get.mockReturnValue(of(mockAxiosResponse([])))
      const result = await service.fetchDestinations('YYZ')
      expect(result).toEqual([])
    })

    it('should handle destination with no country codes or durations', async () => {
      const rawResponse = [
        {
          destinations: [
            'Punta Cana--xx--Punta Cana xxx401xxx--xx--',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      expect(result[0]!.name).toBe('Punta Cana')
      expect(result[0]!.id).toBe('401')
      expect(result[0]!.countryCodes).toBe('')
      expect(result[0]!.durations).toEqual([])
    })

    it('should parse durations as numbers', async () => {
      const rawResponse = [
        {
          destinations: [
            'Cuba--xx--Cuba xxx501xxxCU--xx--7,10,14,21',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      expect(result[0]!.durations).toEqual([7, 10, 14, 21])
      result[0]!.durations.forEach((d) => expect(typeof d).toBe('number'))
    })

    it('should handle multiple destinations including groups and individuals', async () => {
      const rawResponse = [
        {
          destinations: [
            'All Caribbean--xx--All Caribbean xxx601,602,603xxxMX,DO,CU--xx--7,14',
            '- Cancun--xx--Cancun xxx601xxxMX--xx--7',
            'Punta Cana--xx--Punta Cana xxx602xxxDO--xx--7,14',
            'Havana--xx--Havana xxx603xxxCU--xx--14',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchDestinations('YYZ')

      // "All Caribbean" has composite ID 601,602,603 → 3 group entries
      // "- Cancun" has single ID → 1 group entry
      // "Punta Cana" and "Havana" have single IDs → 1 each
      expect(result).toHaveLength(6)
      expect(result[0]!.isGroup).toBe(true)   // "All Caribbean" id=601
      expect(result[0]!.id).toBe('601')
      expect(result[1]!.isGroup).toBe(true)   // "All Caribbean" id=602
      expect(result[2]!.isGroup).toBe(true)   // "All Caribbean" id=603
      expect(result[3]!.isGroup).toBe(true)   // "- Cancun" id=601
      expect(result[4]!.isGroup).toBe(false)  // "Punta Cana" id=602
      expect(result[5]!.isGroup).toBe(false)  // "Havana" id=603
    })
  })

  // ============================================================================
  // fetchHotels
  // ============================================================================

  describe('fetchHotels', () => {
    it('should parse hotels from VCO response', async () => {
      const rawResponse = [
        {
          hotels: [
            'Riu Palace Las Americas--xx--101',
            'Iberostar Selection Paraiso--xx--102',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchHotels('YYZ', '601')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual<VcoHotel>({ name: 'Riu Palace Las Americas', id: '101' })
      expect(result[1]).toEqual<VcoHotel>({ name: 'Iberostar Selection Paraiso', id: '102' })
    })

    it('should call the correct URL with gateway_dep and dest_dep params', async () => {
      httpService.get.mockReturnValue(of(mockAxiosResponse([{ hotels: [] }])))

      await service.fetchHotels('YUL', '601,602')

      expect(httpService.get).toHaveBeenCalledWith('https://vco.example.com/ajax.cgi', {
        params: {
          action: 'getPackagesHotels',
          code_ag: 'TEST_AG',
          alias: 'test_alias',
          gateway_dep: 'YUL',
          dest_dep: '601,602',
          language: 'en',
        },
      })
    })

    it('should return empty array when response has no hotels array', async () => {
      httpService.get.mockReturnValue(of(mockAxiosResponse([])))
      const result = await service.fetchHotels('YYZ', '601')
      expect(result).toEqual([])
    })

    it('should skip malformed hotel entries missing the separator', async () => {
      const rawResponse = [
        {
          hotels: [
            'Riu Palace Las Americas--xx--101',
            'BadHotelEntryNoSeparator',
            'Dreams Natura Resort--xx--103',
          ],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchHotels('YYZ', '601')

      expect(result).toHaveLength(2)
      expect(result.map((h) => h.id)).toEqual(['101', '103'])
    })

    it('should trim whitespace from hotel names and IDs', async () => {
      const rawResponse = [
        {
          hotels: [' Riu Palace --xx-- 101 '],
        },
      ]
      httpService.get.mockReturnValue(of(mockAxiosResponse(rawResponse)))

      const result = await service.fetchHotels('YYZ', '601')

      expect(result[0]).toEqual({ name: 'Riu Palace', id: '101' })
    })
  })
})
