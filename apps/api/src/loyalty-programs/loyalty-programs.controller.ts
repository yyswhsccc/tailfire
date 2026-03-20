/**
 * Loyalty Programs Catalog Controller
 *
 * CRUD endpoints for agency-scoped loyalty programs catalog.
 * GET is available to all authenticated users.
 * POST/PATCH/DELETE are admin-only.
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
import { ApiTags } from '@nestjs/swagger'
import { LoyaltyProgramsService } from './loyalty-programs.service'
import { CreateLoyaltyProgramCatalogDto, UpdateLoyaltyProgramCatalogDto } from './dto'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import type { AuthContext } from '../auth/auth.types'

@ApiTags('Loyalty Programs')
@Controller('loyalty-programs')
export class LoyaltyProgramsController {
  constructor(private readonly loyaltyProgramsService: LoyaltyProgramsService) {}

  /**
   * List all loyalty programs for the agency
   * GET /loyalty-programs?type=cruise&search=royal&active=true&page=1&limit=50
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loyaltyProgramsService.findAll(auth, {
      type,
      search,
      active,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  /**
   * Get a single loyalty program
   * GET /loyalty-programs/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.loyaltyProgramsService.findOne(id, auth)
  }

  /**
   * Create a new loyalty program (Admin only)
   * POST /loyalty-programs
   */
  @Post()
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateLoyaltyProgramCatalogDto,
  ) {
    return this.loyaltyProgramsService.create(dto, auth)
  }

  /**
   * Update a loyalty program (Admin only)
   * PATCH /loyalty-programs/:id
   */
  @Patch(':id')
  @AdminOnly()
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyProgramCatalogDto,
  ) {
    return this.loyaltyProgramsService.update(id, dto, auth)
  }

  /**
   * Soft-delete a loyalty program (Admin only)
   * DELETE /loyalty-programs/:id
   */
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.loyaltyProgramsService.remove(id, auth)
  }
}
