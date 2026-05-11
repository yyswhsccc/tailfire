/**
 * Commission Adjustments Service
 *
 * Business logic for commission adjustments (tax deductions, corrections).
 * Tax-aware fields (taxType, taxRate) fix TraveleSolutions' manual workaround.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { eq, and, desc, count } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import type {
  CreateCommissionAdjustmentDto,
  UpdateCommissionAdjustmentDto,
  CommissionAdjustmentResponseDto,
  CommissionAdjustmentFilterDto,
  PaginatedCommissionAdjustmentsResponseDto,
} from './commission.types'

@Injectable()
export class CommissionAdjustmentsService {
  constructor(private readonly db: DatabaseService) {}

  async createAdjustment(
    agencyId: string,
    dto: CreateCommissionAdjustmentDto,
    userId?: string
  ): Promise<CommissionAdjustmentResponseDto> {
    // If check is specified, verify it exists and belongs to agency
    if (dto.checkId) {
      const [check] = await this.db.client
        .select()
        .from(this.db.schema.commissionChecks)
        .where(
          and(
            eq(this.db.schema.commissionChecks.id, dto.checkId),
            eq(this.db.schema.commissionChecks.agencyId, agencyId)
          )
        )
        .limit(1)

      if (!check) {
        throw new NotFoundException(`Commission check ${dto.checkId} not found`)
      }
    }

    const [adjustment] = await this.db.client
      .insert(this.db.schema.commissionAdjustments)
      .values({
        checkId: dto.checkId,
        agencyId,
        description: dto.description,
        amountCents: dto.amountCents,
        currency: dto.currency ?? 'CAD',
        adjustmentType: dto.adjustmentType,
        taxType: dto.taxType,
        taxRate: dto.taxRate?.toString(),
        agentUserId: dto.agentUserId,
        companyName: dto.companyName,
        status: 'pending',
        source: dto.source ?? 'manual',
        sourceRef: dto.sourceRef,
        createdBy: userId,
      })
      .returning()

    return this.formatAdjustment(adjustment)
  }

  async getAdjustments(
    agencyId: string,
    filter: CommissionAdjustmentFilterDto
  ): Promise<PaginatedCommissionAdjustmentsResponseDto> {
    const page = filter.page ?? 1
    const limit = filter.limit ?? 50
    const offset = (page - 1) * limit

    const conditions = [eq(this.db.schema.commissionAdjustments.agencyId, agencyId)]

    if (filter.checkId) {
      conditions.push(eq(this.db.schema.commissionAdjustments.checkId, filter.checkId))
    }

    if (filter.adjustmentType) {
      conditions.push(
        eq(this.db.schema.commissionAdjustments.adjustmentType, filter.adjustmentType)
      )
    }

    if (filter.status) {
      conditions.push(eq(this.db.schema.commissionAdjustments.status, filter.status))
    }

    const whereClause = and(...conditions)

    const [adjustments, countResult] = await Promise.all([
      this.db.client
        .select()
        .from(this.db.schema.commissionAdjustments)
        .where(whereClause)
        .orderBy(desc(this.db.schema.commissionAdjustments.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.client
        .select({ total: count() })
        .from(this.db.schema.commissionAdjustments)
        .where(whereClause),
    ])

    const total = countResult[0]?.total ?? 0

    return {
      data: adjustments.map((a) => this.formatAdjustment(a)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async updateAdjustment(
    agencyId: string,
    adjustmentId: string,
    dto: UpdateCommissionAdjustmentDto
  ): Promise<CommissionAdjustmentResponseDto> {
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.commissionAdjustments)
      .where(
        and(
          eq(this.db.schema.commissionAdjustments.id, adjustmentId),
          eq(this.db.schema.commissionAdjustments.agencyId, agencyId)
        )
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Adjustment ${adjustmentId} not found`)
    }

    if (existing.status === 'reconciled') {
      throw new BadRequestException('Cannot update a reconciled adjustment')
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (dto.description !== undefined) updateData.description = dto.description
    if (dto.amountCents !== undefined) updateData.amountCents = dto.amountCents
    if (dto.adjustmentType !== undefined) updateData.adjustmentType = dto.adjustmentType
    if (dto.taxType !== undefined) updateData.taxType = dto.taxType
    if (dto.taxRate !== undefined) updateData.taxRate = dto.taxRate.toString()
    if (dto.agentUserId !== undefined) updateData.agentUserId = dto.agentUserId
    if (dto.companyName !== undefined) updateData.companyName = dto.companyName

    const [updated] = await this.db.client
      .update(this.db.schema.commissionAdjustments)
      .set(updateData)
      .where(eq(this.db.schema.commissionAdjustments.id, adjustmentId))
      .returning()

    return this.formatAdjustment(updated)
  }

  private formatAdjustment(adjustment: any): CommissionAdjustmentResponseDto {
    return {
      id: adjustment.id,
      checkId: adjustment.checkId,
      agencyId: adjustment.agencyId,
      description: adjustment.description,
      amountCents: adjustment.amountCents,
      adjustmentType: adjustment.adjustmentType,
      taxType: adjustment.taxType,
      taxRate: adjustment.taxRate,
      agentUserId: adjustment.agentUserId,
      companyName: adjustment.companyName,
      status: adjustment.status,
      source: adjustment.source,
      sourceRef: adjustment.sourceRef,
      createdBy: adjustment.createdBy,
      createdAt: adjustment.createdAt.toISOString(),
      updatedAt: adjustment.updatedAt.toISOString(),
    }
  }
}
