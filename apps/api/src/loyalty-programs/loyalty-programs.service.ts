/**
 * Loyalty Programs Catalog Service
 *
 * CRUD for agency-scoped loyalty programs catalog.
 * These are the programs available in the Library for agents to reference.
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, ilike, or, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { AuditEvent } from '../activity-logs/events/audit.event'
import type { AuthContext } from '../auth/auth.types'
import type { CreateLoyaltyProgramCatalogDto } from './dto/create-loyalty-program-catalog.dto'
import type { UpdateLoyaltyProgramCatalogDto } from './dto/update-loyalty-program-catalog.dto'
import type { LoyaltyProgramCatalogDto } from '@tailfire/shared-types'

@Injectable()
export class LoyaltyProgramsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * List all loyalty programs for the agency
   */
  async findAll(
    auth: AuthContext,
    filters?: { type?: string; search?: string; active?: string; page?: number; limit?: number },
  ) {
    const { agencyId } = auth
    const page = filters?.page ?? 1
    const limit = Math.min(filters?.limit ?? 50, 100)
    const offset = (page - 1) * limit

    // Build conditions
    const conditions = [eq(this.db.schema.loyaltyPrograms.agencyId, agencyId)]

    if (filters?.type) {
      conditions.push(eq(this.db.schema.loyaltyPrograms.programType, filters.type))
    }

    if (filters?.active === 'true') {
      conditions.push(eq(this.db.schema.loyaltyPrograms.isActive, true))
    } else if (filters?.active === 'false') {
      conditions.push(eq(this.db.schema.loyaltyPrograms.isActive, false))
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`
      conditions.push(
        or(
          ilike(this.db.schema.loyaltyPrograms.providerName, searchPattern),
          ilike(this.db.schema.loyaltyPrograms.programName, searchPattern),
        )!,
      )
    }

    const where = and(...conditions)

    const programs = await this.db.client
      .select()
      .from(this.db.schema.loyaltyPrograms)
      .where(where)
      .orderBy(
        asc(this.db.schema.loyaltyPrograms.providerName),
        asc(this.db.schema.loyaltyPrograms.programName),
      )
      .limit(limit)
      .offset(offset)

    // Count total
    const allMatching = await this.db.client
      .select({ id: this.db.schema.loyaltyPrograms.id })
      .from(this.db.schema.loyaltyPrograms)
      .where(where)

    const total = allMatching.length

    return {
      programs: programs.map((p) => this.format(p)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Get a single loyalty program by ID
   */
  async findOne(id: string, auth: AuthContext): Promise<LoyaltyProgramCatalogDto> {
    const [program] = await this.db.client
      .select()
      .from(this.db.schema.loyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.loyaltyPrograms.id, id),
          eq(this.db.schema.loyaltyPrograms.agencyId, auth.agencyId),
        ),
      )
      .limit(1)

    if (!program) {
      throw new NotFoundException(`Loyalty program ${id} not found`)
    }

    return this.format(program)
  }

  /**
   * Create a new catalog entry
   */
  async create(dto: CreateLoyaltyProgramCatalogDto, auth: AuthContext): Promise<LoyaltyProgramCatalogDto> {
    try {
      const [program] = await this.db.client
        .insert(this.db.schema.loyaltyPrograms)
        .values({
          agencyId: auth.agencyId,
          providerName: dto.providerName,
          programName: dto.programName,
          programType: dto.programType,
          logoUrl: dto.logoUrl || null,
          websiteUrl: dto.websiteUrl || null,
          notes: dto.notes || null,
        })
        .returning()

      this.eventEmitter.emit(
        'audit.created',
        new AuditEvent(
          'loyalty_program',
          program!.id,
          'created',
          null,
          auth.userId,
          `${dto.providerName} — ${dto.programName}`,
        ),
      )

      return this.format(program!)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          `A loyalty program for "${dto.providerName} — ${dto.programName}" already exists`,
        )
      }
      throw error
    }
  }

  /**
   * Update a catalog entry
   */
  async update(id: string, dto: UpdateLoyaltyProgramCatalogDto, auth: AuthContext): Promise<LoyaltyProgramCatalogDto> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (dto.providerName !== undefined) updateData.providerName = dto.providerName
    if (dto.programName !== undefined) updateData.programName = dto.programName
    if (dto.programType !== undefined) updateData.programType = dto.programType
    if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl || null
    if (dto.websiteUrl !== undefined) updateData.websiteUrl = dto.websiteUrl || null
    if (dto.notes !== undefined) updateData.notes = dto.notes || null
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive

    try {
      const [updated] = await this.db.client
        .update(this.db.schema.loyaltyPrograms)
        .set(updateData)
        .where(
          and(
            eq(this.db.schema.loyaltyPrograms.id, id),
            eq(this.db.schema.loyaltyPrograms.agencyId, auth.agencyId),
          ),
        )
        .returning()

      if (!updated) {
        throw new NotFoundException(`Loyalty program ${id} not found`)
      }

      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent(
          'loyalty_program',
          id,
          'updated',
          null,
          auth.userId,
          `${updated.providerName} — ${updated.programName}`,
        ),
      )

      return this.format(updated)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException('A loyalty program with this provider and program name already exists')
      }
      throw error
    }
  }

  /**
   * Soft-delete (set isActive=false)
   */
  async remove(id: string, auth: AuthContext): Promise<void> {
    const [updated] = await this.db.client
      .update(this.db.schema.loyaltyPrograms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(this.db.schema.loyaltyPrograms.id, id),
          eq(this.db.schema.loyaltyPrograms.agencyId, auth.agencyId),
        ),
      )
      .returning()

    if (!updated) {
      throw new NotFoundException(`Loyalty program ${id} not found`)
    }

    this.eventEmitter.emit(
      'audit.deleted',
      new AuditEvent(
        'loyalty_program',
        id,
        'deleted',
        null,
        auth.userId,
        `${updated.providerName} — ${updated.programName}`,
      ),
    )
  }

  /**
   * Find a catalog entry by ID (no auth check — for internal use)
   */
  async findByIdInternal(id: string) {
    const [program] = await this.db.client
      .select()
      .from(this.db.schema.loyaltyPrograms)
      .where(eq(this.db.schema.loyaltyPrograms.id, id))
      .limit(1)

    return program || null
  }

  /**
   * List active programs for an agency (no auth — for internal/portal use)
   */
  async findActiveByAgency(agencyId: string, filters?: { type?: string; search?: string }) {
    const conditions = [
      eq(this.db.schema.loyaltyPrograms.agencyId, agencyId),
      eq(this.db.schema.loyaltyPrograms.isActive, true),
    ]

    if (filters?.type) {
      conditions.push(eq(this.db.schema.loyaltyPrograms.programType, filters.type))
    }

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`
      conditions.push(
        or(
          ilike(this.db.schema.loyaltyPrograms.providerName, searchPattern),
          ilike(this.db.schema.loyaltyPrograms.programName, searchPattern),
        )!,
      )
    }

    const programs = await this.db.client
      .select()
      .from(this.db.schema.loyaltyPrograms)
      .where(and(...conditions))
      .orderBy(
        asc(this.db.schema.loyaltyPrograms.providerName),
        asc(this.db.schema.loyaltyPrograms.programName),
      )

    return programs.map((p) => this.format(p))
  }

  private format(program: any): LoyaltyProgramCatalogDto {
    return {
      id: program.id,
      agencyId: program.agencyId,
      providerName: program.providerName,
      programName: program.programName,
      programType: program.programType,
      logoUrl: program.logoUrl,
      websiteUrl: program.websiteUrl,
      notes: program.notes,
      isActive: program.isActive,
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    }
  }
}
