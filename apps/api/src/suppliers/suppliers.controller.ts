/**
 * Suppliers Controller
 *
 * REST API endpoints for supplier management.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SuppliersService } from './suppliers.service'
import { CreateSupplierDto, UpdateSupplierDto, ListSuppliersDto } from './dto'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import type { SupplierDto, SupplierListResponseDto } from '@tailfire/shared-types'

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /**
   * Get all suppliers with optional filtering and pagination
   * GET /suppliers?search=hotel&supplierType=hotel&page=1&limit=50
   */
  @Get()
  async findAll(@Query() query: ListSuppliersDto): Promise<SupplierListResponseDto> {
    return this.suppliersService.findAll(query)
  }

  /**
   * Create a new supplier (Admin only)
   * POST /suppliers
   */
  @Post()
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createSupplierDto: CreateSupplierDto): Promise<SupplierDto> {
    return this.suppliersService.create(createSupplierDto)
  }

  /**
   * Get a single supplier by ID
   * GET /suppliers/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SupplierDto> {
    return this.suppliersService.findOne(id)
  }

  /**
   * Update a supplier
   * PATCH /suppliers/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ): Promise<SupplierDto> {
    return this.suppliersService.update(id, updateSupplierDto)
  }

  /**
   * Delete a supplier (Admin only)
   * DELETE /suppliers/:id
   */
  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.suppliersService.remove(id)
  }
}
