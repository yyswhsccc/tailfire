/**
 * User Profiles Controller
 *
 * REST API endpoints for user profile management.
 * - /me endpoints: JWT protected, current user only
 * - /public/:id endpoint: No auth required, only public profiles
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { UserProfilesService } from './user-profiles.service'
import { UpdateUserProfileDto } from './dto'
import { AllowPendingUser } from '../auth/decorators/allow-pending.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { Public } from '../auth/decorators/public.decorator'
import type { AuthContext } from '../auth/auth.types'
import type {
  UserProfileResponseDto,
  PublicUserProfileDto,
  AvatarUploadResponseDto,
} from '@tailfire/shared-types'

@ApiTags('User Profiles')
@Controller('user-profiles')
export class UserProfilesController {
  constructor(private readonly userProfilesService: UserProfilesService) {}

  /**
   * Get current user's profile
   * GET /user-profiles/me
   */
  @Get('me')
  @AllowPendingUser()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMyProfile(
    @GetAuthContext() auth: AuthContext,
  ): Promise<UserProfileResponseDto> {
    return this.userProfilesService.getMyProfile(auth.userId)
  }

  /**
   * Update current user's profile
   * PUT /user-profiles/me
   */
  @Put('me')
  @AllowPendingUser()
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMyProfile(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.userProfilesService.updateMyProfile(auth.userId, dto, auth.role)
  }

  /**
   * Upload avatar image
   * POST /user-profiles/me/avatar
   */
  @Post('me/avatar')
  @AllowPendingUser()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload avatar image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @GetAuthContext() auth: AuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<AvatarUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }

    return this.userProfilesService.uploadAvatar(
      auth.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    )
  }

  /**
   * Delete avatar image
   * DELETE /user-profiles/me/avatar
   */
  @Delete('me/avatar')
  @AllowPendingUser()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete avatar image' })
  async deleteAvatar(
    @GetAuthContext() auth: AuthContext,
  ): Promise<void> {
    return this.userProfilesService.deleteAvatar(auth.userId)
  }

  /**
   * Record login timestamp for current user
   * POST /user-profiles/me/record-login
   */
  @Post('me/record-login')
  @AllowPendingUser()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record login timestamp' })
  async recordLogin(@GetAuthContext() auth: AuthContext): Promise<void> {
    await this.userProfilesService.recordLogin(auth.userId)
  }

  /**
   * Activate pending user account (after first login)
   * POST /user-profiles/me/activate
   */
  @Post('me/activate')
  @AllowPendingUser()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate pending user account' })
  async activateMyAccount(
    @GetAuthContext() auth: AuthContext,
  ): Promise<{ activated: boolean }> {
    return this.userProfilesService.activateMyAccount(auth.userId)
  }

  /**
   * Get public profile (B2C)
   * GET /user-profiles/public/:id
   * No authentication required - only returns profiles where isPublicProfile = true
   */
  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'Get public profile (B2C)' })
  async getPublicProfile(
    @Param('id') id: string,
  ): Promise<PublicUserProfileDto> {
    return this.userProfilesService.getPublicProfile(id)
  }
}
