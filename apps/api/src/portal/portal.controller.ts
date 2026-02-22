/**
 * Portal Controller
 *
 * Dedicated controller for client portal endpoints.
 * All routes bypass global JwtAuthGuard via @Public() and use PortalAuthGuard instead.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
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
import { ApiTags, ApiConsumes } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'
import { PortalService } from './portal.service'
import { UpdatePortalProfileDto } from './dto/update-portal-profile.dto'

@ApiTags('Portal')
@Controller('portal')
@Public() // Bypass global JwtAuthGuard + RolesGuard + UserStatusGuard + ActiveUserGuard
@UseGuards(PortalAuthGuard) // Enforce portal-specific auth on all routes
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  /**
   * Activate portal account on first login
   * POST /portal/activate
   */
  @Post('activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async activate(@GetPortalAuth() auth: PortalAuthContext): Promise<void> {
    await this.portalService.activatePortalAccount(auth.userId)
  }

  /**
   * Get portal user profile
   * GET /portal/me
   */
  @Get('me')
  async getProfile(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getPortalProfile(auth.userId)
  }

  /**
   * Update portal user profile
   * PATCH /portal/me
   */
  @Patch('me')
  async updateProfile(
    @GetPortalAuth() auth: PortalAuthContext,
    @Body() dto: UpdatePortalProfileDto,
  ) {
    return this.portalService.updatePortalProfile(auth.userId, dto)
  }

  /**
   * Upload portal avatar
   * POST /portal/me/avatar
   */
  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @GetPortalAuth() auth: PortalAuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<{ photoUrl: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }

    return this.portalService.uploadPortalAvatar(
      auth.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    )
  }

  /**
   * Delete portal avatar
   * DELETE /portal/me/avatar
   */
  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(@GetPortalAuth() auth: PortalAuthContext): Promise<void> {
    return this.portalService.deletePortalAvatar(auth.userId)
  }

  /**
   * Get trips for portal user
   * GET /portal/my-trips
   */
  @Get('my-trips')
  async getTrips(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getTripsForPortalUser(auth.userId)
  }

  /**
   * Get documents for portal user
   * GET /portal/my-documents
   */
  @Get('my-documents')
  async getDocuments(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getDocumentsForPortalUser(auth.userId)
  }
}
