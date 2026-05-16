/**
 * Suppliers Service
 *
 * Business logic for managing suppliers (hotels, airlines, tour operators, etc.)
 */

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common'
import { eq, ilike, sql, and, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type {
  SupplierDto,
  SupplierListResponseDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  ListSuppliersParamsDto,
} from '@tailfire/shared-types'

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all suppliers with optional filtering and pagination
   */
  async findAll(params: ListSuppliersParamsDto = {}): Promise<SupplierListResponseDto> {
    const { search, supplierType, isActive, page = 1, limit = 50 } = params
    const offset = (page - 1) * limit

    // Build where conditions
    const conditions = []
    if (search) {
      conditions.push(ilike(this.db.schema.suppliers.name, `%${search}%`))
    }
    if (supplierType) {
      conditions.push(eq(this.db.schema.suppliers.supplierType, supplierType))
    }
    if (isActive !== undefined) {
      conditions.push(eq(this.db.schema.suppliers.isActive, isActive))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(this.db.schema.suppliers)
      .where(whereClause)

    const total = countResult[0]?.count ?? 0
    const totalPages = Math.ceil(total / limit)

    // Get paginated suppliers
    const suppliers = await this.db.client
      .select()
      .from(this.db.schema.suppliers)
      .where(whereClause)
      .orderBy(asc(this.db.schema.suppliers.name))
      .limit(limit)
      .offset(offset)

    return {
      suppliers: suppliers.map(this.mapToDto),
      total,
      page,
      limit,
      totalPages,
    }
  }

  /**
   * Get a single supplier by ID
   */
  async findOne(id: string): Promise<SupplierDto> {
    const [supplier] = await this.db.client
      .select()
      .from(this.db.schema.suppliers)
      .where(eq(this.db.schema.suppliers.id, id))
      .limit(1)

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`)
    }

    return this.mapToDto(supplier)
  }

  /**
   * Find a supplier by name (case-insensitive) or create one if not found.
   * Used by OCR import to auto-create suppliers from extracted invoice data.
   */
  async findOrCreateByName(
    name: string,
    defaults?: Partial<CreateSupplierDto>,
  ): Promise<SupplierDto> {
    const normalizedName = name.trim()
    if (!normalizedName) {
      throw new Error('Supplier name is required')
    }

    // Prefer match with matching supplierType to avoid cross-type collisions
    if (defaults?.supplierType) {
      const exactMatch = await this.db.client
        .select()
        .from(this.db.schema.suppliers)
        .where(
          and(
            ilike(this.db.schema.suppliers.name, normalizedName),
            eq(this.db.schema.suppliers.supplierType, defaults.supplierType),
          ),
        )
        .orderBy(asc(this.db.schema.suppliers.createdAt))
        .limit(1)

      if (exactMatch[0]) {
        this.logger.log(`Found existing supplier (type match): ${exactMatch[0].name} (${exactMatch[0].id})`)
        return this.mapToDto(exactMatch[0])
      }
    }

    // Fall back to name-only lookup
    const existing = await this.db.client
      .select()
      .from(this.db.schema.suppliers)
      .where(ilike(this.db.schema.suppliers.name, normalizedName))
      .orderBy(asc(this.db.schema.suppliers.createdAt))
      .limit(1)

    if (existing[0]) {
      this.logger.log(`Found existing supplier: ${existing[0].name} (${existing[0].id})`)
      return this.mapToDto(existing[0])
    }

    // Create new supplier
    this.logger.log(`Creating new supplier: ${normalizedName}`)
    const [supplier] = await this.db.client
      .insert(this.db.schema.suppliers)
      .values({
        name: normalizedName,
        legalName: defaults?.legalName?.trim() || null,
        supplierType: defaults?.supplierType?.trim() || null,
        contactInfo: defaults?.contactInfo || null,
        defaultCommissionRate: defaults?.defaultCommissionRate || null,
        isActive: true,
        isPreferred: false,
      })
      .returning()

    return this.mapToDto(supplier!)
  }

  /**
   * Create a new supplier
   */
  async create(dto: CreateSupplierDto): Promise<SupplierDto> {
    // Check if supplier name already exists (case-insensitive)
    const existing = await this.db.client
      .select()
      .from(this.db.schema.suppliers)
      .where(ilike(this.db.schema.suppliers.name, dto.name.trim()))
      .limit(1)

    if (existing.length > 0) {
      throw new ConflictException(`Supplier with name "${dto.name}" already exists`)
    }

    const [supplier] = await this.db.client
      .insert(this.db.schema.suppliers)
      .values({
        name: dto.name.trim(),
        legalName: dto.legalName?.trim() || null,
        supplierType: dto.supplierType?.trim() || null,
        contactInfo: dto.contactInfo || null,
        defaultCommissionRate: dto.defaultCommissionRate || null,
        // PR-2 commit 7: commission-tax defaults (PR-1 columns)
        defaultCommissionTaxType: dto.defaultCommissionTaxType ?? null,
        defaultCommissionTaxRatePercent: dto.defaultCommissionTaxRatePercent ?? null,
        commissionIncludesTax: dto.commissionIncludesTax ?? false,
        isActive: dto.isActive ?? true,
        isPreferred: dto.isPreferred ?? false,
        notes: dto.notes || null,
        defaultTermsAndConditions: dto.defaultTermsAndConditions || null,
        defaultCancellationPolicy: dto.defaultCancellationPolicy || null,
      })
      .returning()

    return this.mapToDto(supplier!)
  }

  /**
   * Update an existing supplier
   */
  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDto> {
    // Check if supplier exists
    await this.findOne(id)

    // If updating name, check for conflicts
    if (dto.name) {
      const existing = await this.db.client
        .select()
        .from(this.db.schema.suppliers)
        .where(
          and(
            ilike(this.db.schema.suppliers.name, dto.name.trim()),
            sql`${this.db.schema.suppliers.id} != ${id}`
          )
        )
        .limit(1)

      if (existing.length > 0) {
        throw new ConflictException(`Supplier with name "${dto.name}" already exists`)
      }
    }

    const [supplier] = await this.db.client
      .update(this.db.schema.suppliers)
      .set({
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.legalName !== undefined && { legalName: dto.legalName?.trim() || null }),
        ...(dto.supplierType !== undefined && {
          supplierType: dto.supplierType?.trim() || null,
        }),
        ...(dto.contactInfo !== undefined && { contactInfo: dto.contactInfo }),
        ...(dto.defaultCommissionRate !== undefined && {
          defaultCommissionRate: dto.defaultCommissionRate || null,
        }),
        // PR-2 commit 7: commission-tax defaults
        ...(dto.defaultCommissionTaxType !== undefined && {
          defaultCommissionTaxType: dto.defaultCommissionTaxType ?? null,
        }),
        ...(dto.defaultCommissionTaxRatePercent !== undefined && {
          defaultCommissionTaxRatePercent: dto.defaultCommissionTaxRatePercent ?? null,
        }),
        ...(dto.commissionIncludesTax !== undefined && {
          commissionIncludesTax: dto.commissionIncludesTax,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isPreferred !== undefined && { isPreferred: dto.isPreferred }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(dto.defaultTermsAndConditions !== undefined && {
          defaultTermsAndConditions: dto.defaultTermsAndConditions || null,
        }),
        ...(dto.defaultCancellationPolicy !== undefined && {
          defaultCancellationPolicy: dto.defaultCancellationPolicy || null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.suppliers.id, id))
      .returning()

    return this.mapToDto(supplier!)
  }

  /**
   * Delete a supplier
   */
  async remove(id: string): Promise<void> {
    // Check if supplier exists
    await this.findOne(id)

    // Delete supplier
    await this.db.client
      .delete(this.db.schema.suppliers)
      .where(eq(this.db.schema.suppliers.id, id))
  }

  /**
   * Map database record to DTO
   */
  private mapToDto(supplier: typeof this.db.schema.suppliers.$inferSelect): SupplierDto {
    return {
      id: supplier.id,
      name: supplier.name,
      legalName: supplier.legalName,
      supplierType: supplier.supplierType,
      contactInfo: supplier.contactInfo as SupplierDto['contactInfo'],
      defaultCommissionRate: supplier.defaultCommissionRate,
      // PR-2 commit 7: surface commission-tax defaults on every supplier read.
      defaultCommissionTaxType: supplier.defaultCommissionTaxType,
      defaultCommissionTaxRatePercent: supplier.defaultCommissionTaxRatePercent,
      commissionIncludesTax: supplier.commissionIncludesTax,
      isActive: supplier.isActive,
      isPreferred: supplier.isPreferred,
      notes: supplier.notes,
      defaultTermsAndConditions: supplier.defaultTermsAndConditions,
      defaultCancellationPolicy: supplier.defaultCancellationPolicy,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    }
  }
}
