/**
 * Contact Loyalty Programs Service
 *
 * Business logic for managing loyalty/rewards program memberships for contacts.
 * Membership numbers are PII — access controlled via ContactAccessService.
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, asc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ContactAccessService } from './contact-access.service'
import { AuditEvent } from '../activity-logs/events/audit.event'
import { computeAuditDiff } from '../activity-logs/audit-sanitizer'
import type { AuthContext } from '../auth/auth.types'
import type { LoyaltyProgramDto } from '../../../../packages/shared-types/src/api'
import type { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto'
import type { UpdateLoyaltyProgramDto } from './dto/update-loyalty-program.dto'

@Injectable()
export class ContactLoyaltyProgramsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly contactAccess: ContactAccessService,
  ) {}

  /**
   * Check access to a contact's loyalty programs (PII — requires sensitive access)
   */
  private async checkAccess(contactId: string, auth: AuthContext): Promise<void> {
    const access = await this.contactAccess.canAccessSensitiveData(contactId, auth)
    if (!access.canAccessBasic) {
      throw new NotFoundException(`Contact ${contactId} not found`)
    }
    if (!access.canAccessSensitive) {
      throw new ForbiddenException('You do not have access to this contact\'s sensitive data')
    }
  }

  /**
   * List all loyalty programs for a contact
   */
  async findAll(contactId: string, auth: AuthContext): Promise<LoyaltyProgramDto[]> {
    await this.checkAccess(contactId, auth)

    const programs = await this.db.client
      .select()
      .from(this.db.schema.contactLoyaltyPrograms)
      .where(eq(this.db.schema.contactLoyaltyPrograms.contactId, contactId))
      .orderBy(asc(this.db.schema.contactLoyaltyPrograms.providerName))

    return programs.map((p) => this.formatLoyaltyProgram(p))
  }

  /**
   * Get a single loyalty program by ID
   */
  async findOne(contactId: string, id: string, auth: AuthContext): Promise<LoyaltyProgramDto> {
    await this.checkAccess(contactId, auth)

    const [program] = await this.db.client
      .select()
      .from(this.db.schema.contactLoyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.contactLoyaltyPrograms.id, id),
          eq(this.db.schema.contactLoyaltyPrograms.contactId, contactId),
        ),
      )
      .limit(1)

    if (!program) {
      throw new NotFoundException(`Loyalty program ${id} not found`)
    }

    return this.formatLoyaltyProgram(program)
  }

  /**
   * Create a new loyalty program for a contact
   */
  async create(
    contactId: string,
    dto: CreateLoyaltyProgramDto,
    auth: AuthContext,
  ): Promise<LoyaltyProgramDto> {
    await this.checkAccess(contactId, auth)

    // If loyaltyProgramId provided, auto-fill provider/program names from catalog
    let providerName = dto.providerName
    let programName = dto.programName
    if (dto.loyaltyProgramId) {
      const [catalogEntry] = await this.db.client
        .select()
        .from(this.db.schema.loyaltyPrograms)
        .where(eq(this.db.schema.loyaltyPrograms.id, dto.loyaltyProgramId))
        .limit(1)
      if (catalogEntry) {
        providerName = catalogEntry.providerName
        programName = catalogEntry.programName
      }
    }

    try {
      const results = await this.db.client
        .insert(this.db.schema.contactLoyaltyPrograms)
        .values({
          contactId,
          programName,
          providerName,
          membershipNumber: dto.membershipNumber.trim(),
          tierLevel: dto.tierLevel || null,
          notes: dto.notes || null,
          metadata: dto.metadata || {},
          loyaltyProgramId: dto.loyaltyProgramId || null,
        })
        .returning()

      const program = results[0]!

      this.eventEmitter.emit(
        'audit.created',
        new AuditEvent(
          'contact_loyalty_program',
          program.id,
          'created',
          null,
          auth.userId,
          `${dto.providerName} — ${dto.programName}`,
          { parentId: contactId },
        ),
      )

      return this.formatLoyaltyProgram(program)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          `A loyalty program for ${dto.providerName} with membership number ${dto.membershipNumber.trim()} already exists for this contact`,
        )
      }
      throw error
    }
  }

  /**
   * Update a loyalty program
   */
  async update(
    contactId: string,
    id: string,
    dto: UpdateLoyaltyProgramDto,
    auth: AuthContext,
  ): Promise<LoyaltyProgramDto> {
    await this.checkAccess(contactId, auth)

    // Fetch existing for audit diff
    const [existing] = await this.db.client
      .select()
      .from(this.db.schema.contactLoyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.contactLoyaltyPrograms.id, id),
          eq(this.db.schema.contactLoyaltyPrograms.contactId, contactId),
        ),
      )
      .limit(1)

    if (!existing) {
      throw new NotFoundException(`Loyalty program ${id} not found`)
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (dto.programName !== undefined) updateData.programName = dto.programName
    if (dto.providerName !== undefined) updateData.providerName = dto.providerName
    if (dto.membershipNumber !== undefined) updateData.membershipNumber = dto.membershipNumber.trim()
    if (dto.tierLevel !== undefined) updateData.tierLevel = dto.tierLevel || null
    if (dto.notes !== undefined) updateData.notes = dto.notes || null
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata
    if (dto.loyaltyProgramId !== undefined) updateData.loyaltyProgramId = dto.loyaltyProgramId || null

    try {
      const [updated] = await this.db.client
        .update(this.db.schema.contactLoyaltyPrograms)
        .set(updateData)
        .where(
          and(
            eq(this.db.schema.contactLoyaltyPrograms.id, id),
            eq(this.db.schema.contactLoyaltyPrograms.contactId, contactId),
          ),
        )
        .returning()

      if (!updated) {
        throw new NotFoundException(`Loyalty program ${id} not found`)
      }

      const diff = computeAuditDiff('contact_loyalty_program', existing as any, updated as any)

      this.eventEmitter.emit(
        'audit.updated',
        new AuditEvent(
          'contact_loyalty_program',
          id,
          'updated',
          null,
          auth.userId,
          `${updated.providerName} — ${updated.programName}`,
          {
            parentId: contactId,
            before: diff.before,
            after: diff.after,
            changedFields: diff.changedFields,
          },
        ),
      )

      return this.formatLoyaltyProgram(updated)
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictException(
          'A loyalty program with this provider and membership number already exists for this contact',
        )
      }
      throw error
    }
  }

  /**
   * Delete a loyalty program
   */
  async remove(contactId: string, id: string, auth: AuthContext): Promise<void> {
    await this.checkAccess(contactId, auth)

    const [deleted] = await this.db.client
      .delete(this.db.schema.contactLoyaltyPrograms)
      .where(
        and(
          eq(this.db.schema.contactLoyaltyPrograms.id, id),
          eq(this.db.schema.contactLoyaltyPrograms.contactId, contactId),
        ),
      )
      .returning()

    if (!deleted) {
      throw new NotFoundException(`Loyalty program ${id} not found`)
    }

    this.eventEmitter.emit(
      'audit.deleted',
      new AuditEvent(
        'contact_loyalty_program',
        id,
        'deleted',
        null,
        auth.userId,
        `${deleted.providerName} — ${deleted.programName}`,
        { parentId: contactId },
      ),
    )
  }

  /**
   * Map database entity to response DTO
   */
  private formatLoyaltyProgram(program: any): LoyaltyProgramDto {
    return {
      id: program.id,
      contactId: program.contactId,
      programName: program.programName,
      providerName: program.providerName,
      membershipNumber: program.membershipNumber,
      tierLevel: program.tierLevel,
      notes: program.notes,
      loyaltyProgramId: program.loyaltyProgramId ?? null,
      metadata: program.metadata || {},
      createdAt: program.createdAt.toISOString(),
      updatedAt: program.updatedAt.toISOString(),
    }
  }
}
