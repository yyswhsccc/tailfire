import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard, Throttle } from '@nestjs/throttler'
import { ApiTags } from '@nestjs/swagger'
import { ApiCredentialsService } from './api-credentials.service'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import {
  CreateCredentialDto,
  UpdateCredentialDto,
  RotateCredentialDto,
  CredentialMetadataDto,
  CredentialSecretsDto,
  ProviderMetadataDto,
} from './dto'

/**
 * ApiCredentialsController
 *
 * Manages API credentials for platform administrators.
 * All endpoints are protected by AdminGuard.
 *
 * Endpoints:
 * - GET /providers - Get metadata for all storage providers
 * - POST / - Create new credential
 * - GET / - List all credentials (metadata only)
 * - GET /:id - Get single credential (metadata only)
 * - POST /:id/reveal - Reveal decrypted credentials (use sparingly!)
 * - PUT /:id - Update metadata
 * - POST /:id/rotate - Rotate credentials (create new version)
 * - POST /:id/rollback - Rollback to this version
 * - GET /:id/history - Get version history
 * - DELETE /:id - Revoke credential
 */
@ApiTags('API Credentials')
@Controller('api-credentials')
@AdminOnly()
export class ApiCredentialsController {
  constructor(private readonly service: ApiCredentialsService) {}

  /**
   * Get metadata for all available storage providers
   *
   * Returns information about each provider including:
   * - Required credential fields
   * - Features and benefits
   * - Cost tier
   * - Whether provider is currently configured (has active credentials)
   *
   * This endpoint is used by the Admin UI to render dynamic credential forms.
   */
  @Get('providers')
  async getProviders(): Promise<ProviderMetadataDto[]> {
    return this.service.getProviderMetadata()
  }

  /**
   * Create a new API credential
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCredentialDto): Promise<CredentialMetadataDto> {
    return this.service.create(dto)
  }

  /**
   * List all credentials (metadata only, no secrets)
   */
  @Get()
  async findAll(): Promise<CredentialMetadataDto[]> {
    return this.service.findAll()
  }

  /**
   * Get single credential (metadata only, no secrets)
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<CredentialMetadataDto> {
    return this.service.findOne(id)
  }

  /**
   * Reveal decrypted credentials
   * WARNING: Use sparingly! This exposes sensitive data.
   * Rate limited: 5 reveals per minute per user.
   */
  @Post(':id/reveal')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async reveal(@Param('id') id: string): Promise<CredentialSecretsDto> {
    return this.service.reveal(id)
  }

  /**
   * Test connection for a credential
   * Validates that the credentials work without activating them
   */
  @Post(':id/test-connection')
  async testConnection(@Param('id') id: string) {
    return this.service.testConnection(id)
  }

  /**
   * Update credential metadata (not the credentials themselves)
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCredentialDto,
  ): Promise<CredentialMetadataDto> {
    return this.service.update(id, dto)
  }

  /**
   * Rotate credentials - creates new version, marks old as inactive
   */
  @Post(':id/rotate')
  async rotate(
    @Param('id') id: string,
    @Body() dto: RotateCredentialDto,
  ): Promise<CredentialMetadataDto> {
    return this.service.rotate(id, dto)
  }

  /**
   * Rollback to a specific version (flips is_active flags)
   */
  @Post(':id/rollback')
  async rollback(@Param('id') id: string): Promise<CredentialMetadataDto> {
    return this.service.rollback(id)
  }

  /**
   * Get version history for a credential
   */
  @Get(':id/history')
  async getHistory(@Param('id') id: string): Promise<CredentialMetadataDto[]> {
    return this.service.getHistory(id)
  }

  /**
   * Soft delete (mark as revoked)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id)
  }
}
