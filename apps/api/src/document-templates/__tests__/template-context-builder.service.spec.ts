import { Test, TestingModule } from '@nestjs/testing'
import { TemplateContextBuilderService } from '../template-context-builder.service'
import { DatabaseService } from '../../db/database.service'

// ---------------------------------------------------------------------------
// Mock DatabaseService
// ---------------------------------------------------------------------------

const mockDb = {
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  },
  schema: {
    agencies: { id: 'agencies.id' },
    contacts: { id: 'contacts.id' },
    trips: { id: 'trips.id', primaryContactId: 'trips.primaryContactId', ownerId: 'trips.ownerId' },
    userProfiles: { id: 'userProfiles.id' },
    itineraryActivities: { id: 'itineraryActivities.id' },
    expectedPaymentItems: { id: 'expectedPaymentItems.id' },
  },
  get client() {
    return this.db
  },
}

describe('TemplateContextBuilderService', () => {
  let service: TemplateContextBuilderService

  beforeEach(async () => {
    // Reset all mocks between tests
    jest.clearAllMocks()
    mockDb.db.select.mockReturnThis()
    mockDb.db.from.mockReturnThis()
    mockDb.db.where.mockReturnThis()
    mockDb.db.limit.mockResolvedValue([])

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateContextBuilderService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile()

    service = module.get<TemplateContextBuilderService>(TemplateContextBuilderService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('buildContext — defaults', () => {
    it('should return default null context when no IDs are provided (except agencyId)', async () => {
      const ctx = await service.buildContext({ agencyId: 'agency-1' })

      // Agency was queried but returned empty result set
      expect(ctx.agency).toBeNull()
      expect(ctx.business).toBeNull()
      expect(ctx.contact).toBeNull()
      expect(ctx.trip).toBeNull()
      expect(ctx.agent).toBeNull()
      expect(ctx.activity).toBeNull()
      expect(ctx.payment).toBeNull()
    })
  })

  describe('business alias', () => {
    it('should set business to the same reference as agency', async () => {
      const agencyRow = { id: 'agency-1', name: 'Test Agency' }
      mockDb.db.limit.mockResolvedValue([agencyRow])

      const ctx = await service.buildContext({ agencyId: 'agency-1' })

      expect(ctx.agency).toBe(ctx.business) // strict reference equality
      expect(ctx.agency).toMatchObject({ id: 'agency-1', name: 'Test Agency' })
    })
  })

  describe('additionalVariables', () => {
    it('should spread additional variables at the top level', async () => {
      const ctx = await service.buildContext(
        { agencyId: 'agency-1' },
        { custom_field: 'hello', another: 42 },
      )

      expect(ctx.custom_field).toBe('hello')
      expect(ctx.another).toBe(42)
    })

    it('should not overwrite entity keys when no collision', async () => {
      const ctx = await service.buildContext(
        { agencyId: 'agency-1' },
        { foo: 'bar' },
      )

      // Entity keys are still present (as null)
      expect(ctx.agency).toBeNull()
      expect(ctx.foo).toBe('bar')
    })
  })

  describe('contact convenience fields', () => {
    it('should add first_name, last_name, and full_name to the contact object', async () => {
      const contactRow = { id: 'c-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' }

      // First call (agency) returns empty, second call (contact) returns the row
      let callCount = 0
      mockDb.db.limit.mockImplementation(() => {
        callCount++
        // Call order via Promise.all: agency(1), contact(2), trip(3), agent(4), activity(5), payment(6)
        if (callCount === 2) return Promise.resolve([contactRow])
        return Promise.resolve([])
      })

      const ctx = await service.buildContext({
        agencyId: 'agency-1',
        contactId: 'c-1',
      })

      expect(ctx.contact).not.toBeNull()
      expect((ctx.contact as Record<string, unknown>).first_name).toBe('Jane')
      expect((ctx.contact as Record<string, unknown>).last_name).toBe('Doe')
      expect((ctx.contact as Record<string, unknown>).full_name).toBe('Jane Doe')
    })
  })

  describe('agent convenience fields', () => {
    it('should add first_name, last_name, full_name, and name to the agent object', async () => {
      const agentRow = { id: 'u-1', firstName: 'John', lastName: 'Smith' }

      // With only agencyId + agentId, only two DB calls happen:
      //   1. loadAgency (agency-1)
      //   2. loadAgent  (u-1) — no tripId so no preliminary trip query
      // Contact, trip, activity, payment all short-circuit to null.
      let callCount = 0
      mockDb.db.limit.mockImplementation(() => {
        callCount++
        // call 1 = agency, call 2 = agent
        if (callCount === 2) return Promise.resolve([agentRow])
        return Promise.resolve([])
      })

      const ctx = await service.buildContext({
        agencyId: 'agency-1',
        agentId: 'u-1',
      })

      expect(ctx.agent).not.toBeNull()
      const agent = ctx.agent as Record<string, unknown>
      expect(agent.first_name).toBe('John')
      expect(agent.last_name).toBe('Smith')
      expect(agent.full_name).toBe('John Smith')
      expect(agent.name).toBe('John Smith')
    })
  })

  describe('error handling', () => {
    it('should return null for an entity whose loader throws', async () => {
      mockDb.db.limit.mockRejectedValue(new Error('DB connection lost'))

      const ctx = await service.buildContext({
        agencyId: 'agency-1',
        tripId: 'trip-1',
        contactId: 'c-1',
      })

      // All should gracefully degrade to null
      expect(ctx.agency).toBeNull()
      expect(ctx.contact).toBeNull()
      expect(ctx.trip).toBeNull()
    })
  })
})
