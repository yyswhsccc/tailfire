/**
 * Users Controller
 *
 * REST API endpoints for admin user management.
 * All endpoints require admin role.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { UsersService } from './users.service'
import {
  CreateUserDto,
  InviteUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  ListUsersDto,
} from './dto'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  UserListResponseDto,
  UserDetailDto,
  UserCreatedResponseDto,
  UserInviteResponseDto,
} from '@tailfire/shared-types'

@ApiTags('Users')
@Controller('users')
@AdminOnly()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * List users with filtering and pagination
   * GET /users
   */
  @Get()
  @ApiOperation({ summary: 'List users' })
  async listUsers(
    @GetAuthContext() auth: AuthContext,
    @Query() query: ListUsersDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.listUsers(auth.agencyId, query)
  }

  /**
   * Get user details
   * GET /users/:id
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get user details' })
  async getUser(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<UserDetailDto> {
    return this.usersService.getUserById(id, auth.agencyId)
  }

  /**
   * Create user with full account
   * POST /users
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create user account' })
  async createUser(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateUserDto,
  ): Promise<UserCreatedResponseDto> {
    return this.usersService.createUser(dto, auth.agencyId)
  }

  /**
   * Invite user via email
   * POST /users/invite
   */
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite user via email' })
  async inviteUser(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: InviteUserDto,
  ): Promise<UserInviteResponseDto> {
    return this.usersService.inviteUser(dto, auth.userId, auth.agencyId)
  }

  /**
   * Update user profile
   * PATCH /users/:id
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile' })
  async updateUser(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDetailDto> {
    return this.usersService.updateUser(id, dto, auth.userId, auth.agencyId)
  }

  /**
   * Update user status (lock/unlock/activate)
   * PATCH /users/:id/status
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update user status' })
  async updateUserStatus(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserDetailDto> {
    return this.usersService.updateUserStatus(id, dto, auth.userId, auth.agencyId)
  }

  /**
   * Soft delete user
   * DELETE /users/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  async deleteUser(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.usersService.deleteUser(id, auth.userId, auth.agencyId)
  }

  /**
   * Resend invitation email
   * POST /users/:id/resend-invite
   */
  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend invitation email' })
  async resendInvite(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<UserInviteResponseDto> {
    return this.usersService.resendInvite(id, auth.agencyId)
  }

  /**
   * Reset MFA (unenroll all TOTP factors) for a user
   * POST /users/:id/reset-mfa
   * Admin only — allows admin to reset a user's 2FA when they lose their device
   */
  @Post(':id/reset-mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset MFA for a user' })
  async resetMfa(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<{ success: boolean; factorsRemoved: number }> {
    return this.usersService.resetMfa(id, auth.agencyId, auth.userId)
  }
}
