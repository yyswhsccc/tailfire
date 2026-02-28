import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common'
import { DocumentTemplatesService } from '../document-templates.service'
import { HandlebarsRendererService } from '../handlebars-renderer.service'
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
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  },
  schema: {
    documentTemplates: {
      id: 'documentTemplates.id',
      slug: 'documentTemplates.slug',
      agencyId: 'documentTemplates.agencyId',
      isActive: 'documentTemplates.isActive',
      category: 'documentTemplates.category',
      status: 'documentTemplates.status',
      updatedAt: 'documentTemplates.updatedAt',
      version: 'documentTemplates.version',
    },
  },
  get client() {
    return this.db
  },
}

// ---------------------------------------------------------------------------
// Mock HandlebarsRendererService
// ---------------------------------------------------------------------------

const mockHandlebars = {
  render: jest.fn((template: string, _context: Record<string, unknown>) => `rendered:${template}`),
  onModuleInit: jest.fn(),
}

// ---------------------------------------------------------------------------
// Mock TemplateContextBuilderService
// ---------------------------------------------------------------------------

const mockContextBuilder = {
  buildContext: jest.fn().mockResolvedValue({
    agency: null,
    business: null,
    contact: null,
    trip: null,
    agent: null,
    activity: null,
    payment: null,
  }),
}

// ---------------------------------------------------------------------------
// Helper to reset all mocks
// ---------------------------------------------------------------------------

function resetMocks() {
  jest.clearAllMocks()
  mockDb.db.select.mockReturnThis()
  mockDb.db.from.mockReturnThis()
  mockDb.db.where.mockReturnThis()
  mockDb.db.orderBy.mockReturnThis()
  mockDb.db.limit.mockResolvedValue([])
  mockDb.db.insert.mockReturnThis()
  mockDb.db.values.mockReturnThis()
  mockDb.db.returning.mockResolvedValue([])
  mockDb.db.update.mockReturnThis()
  mockDb.db.set.mockReturnThis()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocumentTemplatesService', () => {
  let service: DocumentTemplatesService

  beforeEach(async () => {
    resetMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentTemplatesService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: HandlebarsRendererService, useValue: mockHandlebars },
        { provide: TemplateContextBuilderService, useValue: mockContextBuilder },
      ],
    }).compile()

    service = module.get<DocumentTemplatesService>(DocumentTemplatesService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // resolveTemplate
  // -------------------------------------------------------------------------

  describe('resolveTemplate', () => {
    it('should return null when no template is found', async () => {
      mockDb.db.limit.mockResolvedValue([])

      const result = await service.resolveTemplate('trip-order', 'agency-1')
      expect(result).toBeNull()
    })

    it('should return the matching template row', async () => {
      const templateRow = {
        id: 'tpl-1',
        slug: 'trip-order',
        agencyId: 'agency-1',
        isActive: true,
        version: 1,
      }
      mockDb.db.limit.mockResolvedValue([templateRow])

      const result = await service.resolveTemplate('trip-order', 'agency-1')
      expect(result).toEqual(templateRow)
    })
  })

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe('getById', () => {
    it('should return null when template not found', async () => {
      mockDb.db.limit.mockResolvedValue([])

      const result = await service.getById('non-existent', 'agency-1')
      expect(result).toBeNull()
    })

    it('should return the template when found', async () => {
      const templateRow = { id: 'tpl-1', agencyId: 'agency-1' }
      mockDb.db.limit.mockResolvedValue([templateRow])

      const result = await service.getById('tpl-1', 'agency-1')
      expect(result).toEqual(templateRow)
    })
  })

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('should query templates with default filters', async () => {
      mockDb.db.orderBy.mockResolvedValue([])

      const result = await service.list('agency-1')
      expect(result).toEqual([])
      expect(mockDb.db.select).toHaveBeenCalled()
    })

    it('should return rows when templates exist', async () => {
      const rows = [
        { id: 'tpl-1', slug: 'trip-order', agencyId: null },
        { id: 'tpl-2', slug: 'payment-receipt', agencyId: 'agency-1' },
      ]
      mockDb.db.orderBy.mockResolvedValue(rows)

      const result = await service.list('agency-1')
      expect(result).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('should insert and return the created template', async () => {
      const createdRow = {
        id: 'tpl-new',
        slug: 'new-template',
        agencyId: 'agency-1',
        name: 'New Template',
        version: 1,
      }
      mockDb.db.returning.mockResolvedValue([createdRow])

      const result = await service.create('agency-1', {
        slug: 'new-template',
        name: 'New Template',
        category: 'trip_order',
        blocksJson: { blocks: [] },
        outputTypes: ['email'],
      }, 'user-1')

      expect(result).toEqual(createdRow)
      expect(mockDb.db.insert).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('should throw NotFoundException when template does not exist', async () => {
      mockDb.db.limit.mockResolvedValue([])

      await expect(
        service.update('non-existent', 'agency-1', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException for system templates', async () => {
      mockDb.db.limit.mockResolvedValue([{ id: 'tpl-sys', agencyId: null, version: 1 }])

      await expect(
        service.update('tpl-sys', 'agency-1', { name: 'Updated' }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('should bump version and return updated template', async () => {
      const existing = { id: 'tpl-1', agencyId: 'agency-1', version: 3, status: 'draft' }
      mockDb.db.limit.mockResolvedValue([existing])

      const updated = { ...existing, version: 4, name: 'Updated' }
      mockDb.db.returning.mockResolvedValue([updated])

      const result = await service.update('tpl-1', 'agency-1', { name: 'Updated' })
      expect(result.version).toBe(4)
    })

    it('should set publishedAt when status changes to published', async () => {
      const existing = { id: 'tpl-1', agencyId: 'agency-1', version: 1, status: 'draft' }
      mockDb.db.limit.mockResolvedValue([existing])

      const updated = { ...existing, version: 2, status: 'published' }
      mockDb.db.returning.mockResolvedValue([updated])

      await service.update('tpl-1', 'agency-1', { status: 'published' })

      // Verify set() was called with publishedAt
      const setCall = mockDb.db.set.mock.calls[0]?.[0]
      expect(setCall).toBeDefined()
      expect(setCall.publishedAt).toBeInstanceOf(Date)
      expect(setCall.status).toBe('published')
    })
  })

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('should throw NotFoundException when template does not exist', async () => {
      mockDb.db.limit.mockResolvedValue([])

      await expect(
        service.softDelete('non-existent', 'agency-1'),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException for system templates', async () => {
      mockDb.db.limit.mockResolvedValue([{ id: 'tpl-sys', agencyId: null, slug: 'sys' }])

      await expect(
        service.softDelete('tpl-sys', 'agency-1'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('should set isActive to false for agency templates', async () => {
      const existing = { id: 'tpl-1', agencyId: 'agency-1', slug: 'my-tpl' }
      mockDb.db.limit.mockResolvedValue([existing])

      await service.softDelete('tpl-1', 'agency-1')

      expect(mockDb.db.update).toHaveBeenCalled()
      const setCall = mockDb.db.set.mock.calls[0]?.[0]
      expect(setCall.isActive).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // fork
  // -------------------------------------------------------------------------

  describe('fork', () => {
    it('should throw NotFoundException when source template does not exist', async () => {
      mockDb.db.limit.mockResolvedValue([])

      await expect(
        service.fork('non-existent', 'agency-1', 'user-1'),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw ConflictException when agency already has a fork', async () => {
      const source = { id: 'tpl-sys', slug: 'trip-order', version: 2 }
      const existingFork = { id: 'tpl-fork', slug: 'trip-order', agencyId: 'agency-1' }

      // First limit() call: source template; second: existing fork check
      let callCount = 0
      mockDb.db.limit.mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([source])
        return Promise.resolve([existingFork])
      })

      await expect(
        service.fork('tpl-sys', 'agency-1', 'user-1'),
      ).rejects.toThrow(ConflictException)
    })

    it('should create a forked template with parentId and parentVersion', async () => {
      const source = {
        id: 'tpl-sys',
        slug: 'trip-order',
        name: 'Trip Order',
        description: 'System template',
        category: 'trip_order',
        blocksJson: { blocks: [] },
        emailHtml: '<p>Hello</p>',
        emailCss: '',
        pdfHtml: null,
        pdfCss: null,
        subjectTemplate: 'Order for {{trip.name}}',
        textTemplate: null,
        variables: null,
        outputTypes: ['email'],
        version: 3,
      }

      // First limit() call: source; second: no existing fork
      let callCount = 0
      mockDb.db.limit.mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([source])
        return Promise.resolve([])
      })

      const forkedRow = {
        id: 'tpl-forked',
        slug: 'trip-order',
        agencyId: 'agency-1',
        parentId: 'tpl-sys',
        parentVersion: 3,
        version: 1,
      }
      mockDb.db.returning.mockResolvedValue([forkedRow])

      const result = await service.fork('tpl-sys', 'agency-1', 'user-1')
      expect(result.parentId).toBe('tpl-sys')
      expect(result.parentVersion).toBe(3)
      expect(result.version).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // renderTemplate
  // -------------------------------------------------------------------------

  describe('renderTemplate', () => {
    it('should throw NotFoundException when template is not found', async () => {
      mockDb.db.limit.mockResolvedValue([])

      await expect(
        service.renderTemplate('non-existent', { agencyId: 'agency-1' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('should render subject, html, and text via Handlebars', async () => {
      const template = {
        id: 'tpl-1',
        slug: 'trip-order',
        version: 2,
        isActive: true,
        agencyId: null,
        subjectTemplate: 'Order: {{trip.name}}',
        emailHtml: '<p>Hello {{contact.first_name}}</p>',
        textTemplate: 'Hello {{contact.first_name}}',
      }
      mockDb.db.limit.mockResolvedValue([template])

      const result = await service.renderTemplate('trip-order', {
        agencyId: 'agency-1',
        tripId: 'trip-1',
      })

      expect(result.templateId).toBe('tpl-1')
      expect(result.templateSlug).toBe('trip-order')
      expect(result.templateVersion).toBe(2)
      expect(mockHandlebars.render).toHaveBeenCalledTimes(3)
      expect(mockContextBuilder.buildContext).toHaveBeenCalledWith(
        { agencyId: 'agency-1', tripId: 'trip-1' },
        undefined,
      )
    })

    it('should return null for subject/html/text when template parts are missing', async () => {
      const template = {
        id: 'tpl-2',
        slug: 'minimal',
        version: 1,
        isActive: true,
        agencyId: null,
        subjectTemplate: null,
        emailHtml: null,
        textTemplate: null,
      }
      mockDb.db.limit.mockResolvedValue([template])

      const result = await service.renderTemplate('minimal', {
        agencyId: 'agency-1',
      })

      expect(result.subject).toBeNull()
      expect(result.html).toBeNull()
      expect(result.text).toBeNull()
      expect(mockHandlebars.render).not.toHaveBeenCalled()
    })
  })
})
