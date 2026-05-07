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
  Param,
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
import { ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'
import { PortalService } from './portal.service'
import { UpdatePortalProfileDto } from './dto/update-portal-profile.dto'
import { CreatePortalLoyaltyProgramDto, UpdatePortalLoyaltyProgramDto } from './dto/portal-loyalty-program.dto'

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

  /**
   * Upload a travel document
   * POST /portal/my-documents
   */
  @Post('my-documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a travel document' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @GetPortalAuth() auth: PortalAuthContext,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp|pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    const validTypes = ['passport', 'visa', 'id_document', 'travel_insurance', 'medical', 'contract', 'invoice', 'receipt', 'authorization', 'other']
    const safeType = validTypes.includes(documentType) ? documentType : 'other'

    return this.portalService.uploadPortalDocument(
      auth.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
      safeType,
    )
  }

  /**
   * Delete a portal document
   * DELETE /portal/my-documents/:id
   */
  @Delete('my-documents/:id')
  @ApiOperation({ summary: 'Delete a portal document' })
  async deleteDocument(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('id') documentId: string,
  ) {
    return this.portalService.deletePortalDocument(auth.userId, documentId)
  }

  // ============================================================================
  // LOYALTY PROGRAMS
  // ============================================================================

  /**
   * Get own loyalty programs
   * GET /portal/my-loyalty-programs
   */
  @Get('my-loyalty-programs')
  async getMyLoyaltyPrograms(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getMyLoyaltyPrograms(auth.userId)
  }

  /**
   * Create a loyalty program
   * POST /portal/my-loyalty-programs
   */
  @Post('my-loyalty-programs')
  async createMyLoyaltyProgram(
    @GetPortalAuth() auth: PortalAuthContext,
    @Body() dto: CreatePortalLoyaltyProgramDto,
  ) {
    return this.portalService.createMyLoyaltyProgram(auth.userId, dto)
  }

  /**
   * Update a loyalty program
   * PATCH /portal/my-loyalty-programs/:id
   */
  @Patch('my-loyalty-programs/:id')
  async updateMyLoyaltyProgram(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePortalLoyaltyProgramDto,
  ) {
    return this.portalService.updateMyLoyaltyProgram(auth.userId, id, dto)
  }

  /**
   * Delete a loyalty program
   * DELETE /portal/my-loyalty-programs/:id
   */
  @Delete('my-loyalty-programs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyLoyaltyProgram(
    @GetPortalAuth() auth: PortalAuthContext,
    @Param('id') id: string,
  ): Promise<void> {
    return this.portalService.deleteMyLoyaltyProgram(auth.userId, id)
  }

  /**
   * Get loyalty programs catalog (active programs for provider dropdown)
   * GET /portal/loyalty-catalog
   */
  @Get('loyalty-catalog')
  async getLoyaltyCatalog(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getLoyaltyCatalog(auth.userId)
  }

  /**
   * Get payment history for authenticated consumer
   * GET /portal/my-payments
   */
  @Get('my-payments')
  @ApiOperation({ summary: 'Get payment history for authenticated consumer' })
  async getMyPayments(@GetPortalAuth() auth: PortalAuthContext) {
    return this.portalService.getPaymentsForPortalUser(auth.userId)
  }
}
