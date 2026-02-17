/**
 * Contact Loyalty Programs Controller
 *
 * REST API endpoints for managing loyalty/rewards program memberships.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContactLoyaltyProgramsService } from './contact-loyalty-programs.service'
import { CreateLoyaltyProgramDto, UpdateLoyaltyProgramDto } from './dto'
import type { LoyaltyProgramDto } from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

@ApiTags('Contact Loyalty Programs')
@Controller('contacts/:contactId/loyalty-programs')
export class ContactLoyaltyProgramsController {
  constructor(private readonly loyaltyProgramsService: ContactLoyaltyProgramsService) {}

  /**
   * List all loyalty programs for a contact
   * GET /contacts/:contactId/loyalty-programs
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ): Promise<LoyaltyProgramDto[]> {
    return this.loyaltyProgramsService.findAll(contactId, auth)
  }

  /**
   * Get a single loyalty program
   * GET /contacts/:contactId/loyalty-programs/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('id') id: string,
  ): Promise<LoyaltyProgramDto> {
    return this.loyaltyProgramsService.findOne(contactId, id, auth)
  }

  /**
   * Create a new loyalty program
   * POST /contacts/:contactId/loyalty-programs
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: CreateLoyaltyProgramDto,
  ): Promise<LoyaltyProgramDto> {
    return this.loyaltyProgramsService.create(contactId, dto, auth)
  }

  /**
   * Update a loyalty program
   * PATCH /contacts/:contactId/loyalty-programs/:id
   */
  @Patch(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyProgramDto,
  ): Promise<LoyaltyProgramDto> {
    return this.loyaltyProgramsService.update(contactId, id, dto, auth)
  }

  /**
   * Delete a loyalty program
   * DELETE /contacts/:contactId/loyalty-programs/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.loyaltyProgramsService.remove(contactId, id, auth)
  }
}
