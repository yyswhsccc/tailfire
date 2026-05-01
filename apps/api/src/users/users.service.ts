/**
 * Users Service
 *
 * Business logic for admin user management operations.
 * Handles Supabase auth admin operations and database CRUD.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { eq, and, or, ilike, sql, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { schema } from '@tailfire/database'

const { userProfiles } = schema
import type { CreateUserDto, InviteUserDto, UpdateUserDto, UpdateUserStatusDto, ListUsersDto } from './dto'
import type {
  UserListItemDto,
  UserDetailDto,
  UserCreatedResponseDto,
  UserInviteResponseDto,
  UserListResponseDto,
} from '@tailfire/shared-types'
import { EmailService } from '../email/email.service'
import { EventEmitter2 } from '@nestjs/event-emitter'

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)
  private readonly supabaseAdmin: SupabaseClient

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }

    this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  /**
   * Get ADMIN_URL with production validation
   */
  private getAdminUrl(): string {
    const adminUrl = this.configService.get<string>('ADMIN_URL')
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production'

    if (!adminUrl) {
      if (isProduction) {
        throw new Error('ADMIN_URL must be configured in production')
      }
      this.logger.warn('ADMIN_URL not configured, using localhost:3100 fallback')
    }

    return adminUrl || 'http://localhost:3100'
  }

  /**
   * List users with filtering and pagination
   */
  async listUsers(agencyId: string, params: ListUsersDto): Promise<UserListResponseDto> {
    const { search, status, role, includeDeleted, page = 1, limit = 20 } = params

    // Build where conditions
    const conditions = [eq(userProfiles.agencyId, agencyId)]

    // Filter by isActive unless includeDeleted is true
    if (!includeDeleted) {
      conditions.push(eq(userProfiles.isActive, true))
    }

    if (status) {
      conditions.push(eq(userProfiles.status, status))
    }

    if (role) {
      conditions.push(eq(userProfiles.role, role))
    }

    if (search) {
      const searchPattern = `%${search}%`
      conditions.push(
        or(
          ilike(userProfiles.email, searchPattern),
          ilike(userProfiles.firstName, searchPattern),
          ilike(userProfiles.lastName, searchPattern),
        )!,
      )
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await this.db.client
      .select({ count: sql<number>`count(*)::int` })
      .from(userProfiles)
      .where(whereClause)

    const total = countResult[0]?.count || 0

    // Get paginated results
    const offset = (page - 1) * limit
    const users = await this.db.client.query.userProfiles.findMany({
      where: whereClause,
      orderBy: [desc(userProfiles.createdAt)],
      limit,
      offset,
    })

    const mappedUsers: UserListItemDto[] = users.map(user => ({
      id: user.id,
      email: user.email || '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
    }))

    return {
      users: mappedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Get user details by ID
   */
  async getUserById(userId: string, agencyId: string): Promise<UserDetailDto> {
    const user = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, userId),
        eq(userProfiles.agencyId, agencyId),
      ),
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return {
      id: user.id,
      email: user.email || '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      phone: user.publicPhone,
      avatarUrl: user.avatarUrl,
      commissionSettings: user.commissionSettings as any || null,
      invitedAt: user.invitedAt?.toISOString() || null,
      invitedBy: user.invitedBy,
      lockedAt: user.lockedAt?.toISOString() || null,
      lockedReason: user.lockedReason,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      updatedAt: user.updatedAt.toISOString(),
    }
  }

  /**
   * Create a new user with full account (direct creation)
   */
  async createUser(dto: CreateUserDto, agencyId: string): Promise<UserCreatedResponseDto> {
    // Check for existing profile
    const existingProfile = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.email, dto.email),
    })

    if (existingProfile) {
      throw new ConflictException('User with this email already exists')
    }

    // Check auth user state via listUsers filter
    const { data: usersData } = await this.supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = usersData?.users?.find(u => u.email === dto.email)
    if (existingAuthUser) {
      throw new ConflictException('User with this email already exists')
    }

    // Generate temporary password
    const tempPassword = this.generateTempPassword()

    // Create auth user
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      email_confirm: true,
      password: tempPassword,
    })

    if (error || !data.user) {
      this.logger.error(`Failed to create auth user: ${error?.message}`)
      throw new InternalServerErrorException('Failed to create user')
    }

    // Create user profile
    try {
      await this.db.client.insert(userProfiles).values({
        id: data.user.id,
        agencyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        status: 'active',
        isActive: true,
        commissionSettings: {
          splitType: 'percentage',
          splitValue: dto.commissionSplit ?? 60,
        },
      })
    } catch (dbError) {
      // Rollback: delete auth user if profile creation fails
      await this.supabaseAdmin.auth.admin.deleteUser(data.user.id)
      throw new InternalServerErrorException('Failed to create user profile')
    }

    // Send password reset email so user can set their own password
    try {
      const adminUrl = this.configService.get<string>('ADMIN_URL') || 'http://localhost:3100'
      await this.supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: dto.email,
        options: {
          redirectTo: `${adminUrl}/auth/reset-password`,
        },
      })
    } catch (emailError) {
      this.logger.warn(`Failed to send password reset email: ${emailError}`)
      // Don't fail the creation - user was created successfully
    }

    this.logger.log(`Created user ${data.user.id}`)
    this.logger.debug(`Created user details: email=${dto.email}`)

    return {
      userId: data.user.id,
      email: dto.email,
    }
  }

  /**
   * Invite a user via email
   *
   * Uses generateLink({ type: 'invite' }) + branded Resend email instead of
   * Supabase's inviteUserByEmail() which sends from their default sender.
   */
  async inviteUser(dto: InviteUserDto, invitedBy: string, agencyId: string): Promise<UserInviteResponseDto> {
    // Check for existing profile
    const existingProfile = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.email, dto.email),
    })

    if (existingProfile) {
      throw new ConflictException('User profile with this email already exists')
    }

    // Check auth user state via listUsers filter
    const { data: usersData } = await this.supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = usersData?.users?.find(u => u.email === dto.email)

    const adminUrl = this.getAdminUrl()

    // Get inviter name for personalized email
    const inviter = await this.db.client.query.userProfiles.findFirst({
      where: eq(userProfiles.id, invitedBy),
      columns: { firstName: true, lastName: true },
    })
    const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : 'Your Agency'

    if (existingAuthUser) {
      const authUser = existingAuthUser

      // If user has confirmed email, they're fully registered
      if (authUser.email_confirmed_at) {
        throw new ConflictException('User with this email already exists and is confirmed')
      }

      // User exists in "invited" state - generate new link and send branded email
      const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: dto.email,
        options: {
          redirectTo: `${adminUrl}/auth/callback`,
        },
      })

      if (linkError || !linkData.properties?.hashed_token) {
        this.logger.error(`Failed to generate invite link: ${linkError?.message}`)
        throw new InternalServerErrorException('Failed to generate invitation')
      }

      // Build direct PKCE link to our callback (bypasses Supabase verify + hash fragment)
      const inviteLink = `${adminUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`

      // Send branded email via Resend (no rollback needed for existing users)
      try {
        await this.emailService.sendInviteEmail(
          dto.email,
          inviteLink,
          dto.firstName,
          agencyId,
          inviterName,
        )
      } catch (emailError) {
        this.logger.error(`Failed to send invite email to existing user: ${emailError}`)
        throw new InternalServerErrorException('Failed to send invitation email')
      }

      // Create profile if it doesn't exist (orphan auth user case)
      await this.db.client
        .insert(userProfiles)
        .values({
          id: authUser.id,
          agencyId,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          status: 'pending',
          isActive: true,
          invitedAt: new Date(),
          invitedBy,
          commissionSettings: { splitType: 'percentage', splitValue: 60 },
        })
        .onConflictDoNothing()

      this.logger.log(`Invited existing user ${authUser.id}`)
      this.logger.debug(`Invite details: email=${dto.email}`)

      return { userId: authUser.id, email: dto.email, inviteSent: true }
    }

    // Step 1: Create auth user WITHOUT sending Supabase's default email
    const { data: userData, error: userError } = await this.supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      email_confirm: false,
    })

    if (userError || !userData.user) {
      this.logger.error(`Failed to create auth user: ${userError?.message}`)
      throw new InternalServerErrorException('Failed to create invitation')
    }

    // Step 2: Generate invite link
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: dto.email,
      options: {
        redirectTo: `${adminUrl}/auth/callback`,
      },
    })

    if (linkError || !linkData.properties?.hashed_token) {
      // Rollback: delete the created user
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      this.logger.error(`Failed to generate invite link: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to generate invitation')
    }

    // Build direct PKCE link to our callback (bypasses Supabase verify + hash fragment)
    const inviteLink = `${adminUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`

    // Step 3: Create user profile (with rollback on failure)
    try {
      await this.db.client.insert(userProfiles).values({
        id: userData.user.id,
        agencyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        status: 'pending',
        isActive: true,
        invitedAt: new Date(),
        invitedBy,
        commissionSettings: { splitType: 'percentage', splitValue: 60 },
      })
    } catch (dbError) {
      // Rollback: delete auth user if profile creation fails
      this.logger.error('Failed to create profile, rolling back auth user')
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      throw new InternalServerErrorException('Failed to create user profile')
    }

    // Step 4: Send branded email (with rollback on failure for new users)
    try {
      await this.emailService.sendInviteEmail(
        dto.email,
        inviteLink,
        dto.firstName,
        agencyId,
        inviterName,
      )
    } catch (emailError) {
      // Rollback: delete auth user and profile if email fails
      this.logger.error(`Failed to send invite email, rolling back user: ${emailError}`)
      await this.db.client.delete(userProfiles).where(eq(userProfiles.id, userData.user.id))
      await this.supabaseAdmin.auth.admin.deleteUser(userData.user.id)
      throw new InternalServerErrorException('Failed to send invitation email')
    }

    this.logger.log(`Invited user ${userData.user.id}`)
    this.logger.debug(`Invite details: email=${dto.email}, firstName=${dto.firstName}`)

    return { userId: userData.user.id, email: dto.email, inviteSent: true }
  }

  /**
   * Update user profile (admin editing user)
   */
  async updateUser(userId: string, dto: UpdateUserDto, adminId: string, agencyId: string): Promise<UserDetailDto> {
    // Get existing user
    const user = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, userId),
        eq(userProfiles.agencyId, agencyId),
      ),
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Admin self-protection: cannot demote themselves
    if (userId === adminId && dto.role && dto.role !== 'admin') {
      throw new ForbiddenException('Cannot demote yourself')
    }

    // Validate commission settings: percentage must be <= 100
    if (dto.commissionSettings) {
      const { splitType, splitValue } = dto.commissionSettings
      if (splitType === 'percentage' && splitValue !== undefined && splitValue > 100) {
        throw new BadRequestException('Commission percentage cannot exceed 100%')
      }
    }

    // Build update object
    const updates: Partial<typeof userProfiles.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (dto.firstName !== undefined) updates.firstName = dto.firstName
    if (dto.lastName !== undefined) updates.lastName = dto.lastName
    if (dto.phone !== undefined) updates.publicPhone = dto.phone
    if (dto.role !== undefined) updates.role = dto.role
    if (dto.commissionSettings !== undefined) {
      updates.commissionSettings = dto.commissionSettings
    }

    await this.db.client
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.id, userId))

    // Emit security.role_changed if role was updated
    if (dto.role !== undefined && dto.role !== user.role) {
      this.eventEmitter.emit('security.role_changed', {
        event: 'security.role_changed',
        userId,
        actorId: adminId,
        agencyId,
        metadata: { oldRole: user.role, newRole: dto.role },
      })
    }

    return this.getUserById(userId, agencyId)
  }

  /**
   * Update user status (lock/unlock/activate)
   */
  async updateUserStatus(
    userId: string,
    dto: UpdateUserStatusDto,
    adminId: string,
    agencyId: string,
  ): Promise<UserDetailDto> {
    // Get existing user
    const user = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, userId),
        eq(userProfiles.agencyId, agencyId),
      ),
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Admin self-protection: cannot lock themselves
    if (userId === adminId && dto.status === 'locked') {
      throw new ForbiddenException('Cannot lock your own account')
    }

    // Build update object
    const updates: Partial<typeof userProfiles.$inferInsert> = {
      status: dto.status,
      updatedAt: new Date(),
    }

    if (dto.status === 'locked') {
      updates.lockedAt = new Date()
      updates.lockedReason = dto.lockedReason || null
    } else {
      // Clear lock fields when unlocking
      updates.lockedAt = null
      updates.lockedReason = null
    }

    await this.db.client
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.id, userId))

    this.logger.log(`Updated user ${userId} status to ${dto.status}`)

    return this.getUserById(userId, agencyId)
  }

  /**
   * Soft delete user (set isActive=false)
   */
  async deleteUser(userId: string, adminId: string, agencyId: string): Promise<void> {
    // Get existing user
    const user = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, userId),
        eq(userProfiles.agencyId, agencyId),
      ),
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Admin self-protection: cannot delete themselves
    if (userId === adminId) {
      throw new ForbiddenException('Cannot delete your own account')
    }

    await this.db.client
      .update(userProfiles)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.id, userId))

    this.logger.log(`Soft deleted user ${userId}`)
  }

  /**
   * Resend invitation email (pending users only)
   *
   * Uses generateLink({ type: 'invite' }) + branded Resend email.
   */
  async resendInvite(userId: string, agencyId: string): Promise<UserInviteResponseDto> {
    // Get existing user
    const user = await this.db.client.query.userProfiles.findFirst({
      where: and(
        eq(userProfiles.id, userId),
        eq(userProfiles.agencyId, agencyId),
      ),
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.status !== 'pending') {
      throw new BadRequestException('Can only resend invites to pending users')
    }

    if (!user.email) {
      throw new BadRequestException('User has no email address')
    }

    const adminUrl = this.getAdminUrl()

    // Generate new invite link
    const { data: linkData, error: linkError } = await this.supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: user.email,
      options: {
        redirectTo: `${adminUrl}/auth/callback`,
      },
    })

    if (linkError || !linkData.properties?.hashed_token) {
      this.logger.error(`Failed to generate invite link: ${linkError?.message}`)
      throw new InternalServerErrorException('Failed to resend invitation')
    }

    // Build direct PKCE link to our callback (bypasses Supabase verify + hash fragment)
    const inviteLink = `${adminUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`

    // Get inviter name if available
    let inviterName = 'Your Agency'
    if (user.invitedBy) {
      const inviter = await this.db.client.query.userProfiles.findFirst({
        where: eq(userProfiles.id, user.invitedBy),
        columns: { firstName: true, lastName: true },
      })
      inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : 'Your Agency'
    }

    // Send branded email
    await this.emailService.sendInviteEmail(
      user.email,
      inviteLink,
      user.firstName || 'there',
      agencyId,
      inviterName,
    )

    // Update invitedAt timestamp
    await this.db.client
      .update(userProfiles)
      .set({
        invitedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.id, userId))

    this.logger.log(`Resent invitation to user ${userId}`)
    this.logger.debug(`Resent invite details: email=${user.email}`)

    return {
      userId,
      email: user.email,
      inviteSent: true,
    }
  }

  /**
   * Activate a pending user (called after first successful login)
   * Returns true if user was activated, false if already active
   */
  async activatePendingUser(userId: string): Promise<boolean> {
    const result = await this.db.client
      .update(userProfiles)
      .set({
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userProfiles.id, userId),
          eq(userProfiles.status, 'pending'),
        ),
      )
      .returning({ id: userProfiles.id })

    if (result.length > 0) {
      this.logger.log(`Activated pending user ${userId}`)
      return true
    }

    return false
  }

  /**
   * Reset MFA for a user — unenroll all TOTP factors via Supabase Admin API.
   */
  async resetMfa(
    userId: string,
    agencyId: string,
    actorId: string,
  ): Promise<{ success: boolean; factorsRemoved: number }> {
    const [user] = await this.db.client
      .select({ id: this.db.schema.userProfiles.id, email: this.db.schema.userProfiles.email })
      .from(this.db.schema.userProfiles)
      .where(
        and(
          eq(this.db.schema.userProfiles.id, userId),
          eq(this.db.schema.userProfiles.agencyId, agencyId),
        ),
      )
      .limit(1)

    if (!user) throw new NotFoundException(`User ${userId} not found`)

    const { data: factorsData, error: listError } =
      await this.supabaseAdmin.auth.admin.mfa.listFactors({ userId })

    if (listError) {
      this.logger.error(`Failed to list MFA factors for user ${userId}: ${listError.message}`)
      throw new BadRequestException('Failed to list MFA factors')
    }

    const factors = factorsData?.factors ?? []
    let removed = 0

    for (const factor of factors) {
      const { error: deleteError } =
        await this.supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
      if (!deleteError) removed++
    }

    this.logger.log(`Admin ${actorId} reset MFA for ${user.email} — ${removed} factor(s) removed`)
    return { success: true, factorsRemoved: removed }
  }

  /**
   * Generate a secure temporary password
   */
  private generateTempPassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()'
    let password = ''
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }
}
