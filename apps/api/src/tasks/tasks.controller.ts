/**
 * Tasks Controller
 *
 * REST API endpoints for Task management.
 *
 * IMPORTANT: Route order matters in NestJS. Specific paths (templates, bulk, from-template)
 * MUST be defined BEFORE dynamic paths (:id) to avoid conflicts.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { TasksService } from './tasks.service'
import { TaskTemplatesService } from './task-templates.service'
import { TaskAccessService } from './task-access.service'
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskFilterDto,
  BulkTaskOperationDto,
  CompleteTaskDto,
  CreateTaskTemplateDto,
  UpdateTaskTemplateDto,
  CreateFromTemplateDto,
} from './dto'
import type {
  TaskResponseDto,
  PaginatedTasksResponseDto,
  BulkTaskResultDto,
  TaskTemplateResponseDto,
} from '../../../../packages/shared-types/src/api'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly templatesService: TaskTemplatesService,
    private readonly accessService: TaskAccessService
  ) {}

  // ============================================================================
  // BASE ROUTES (no path parameters)
  // ============================================================================

  /**
   * Create a new task
   * POST /tasks
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateTaskDto
  ): Promise<TaskResponseDto> {
    // Non-admins can only own their own tasks
    if (auth.role !== 'admin') {
      dto.ownerId = auth.userId
    }
    return this.tasksService.create(dto, auth.agencyId, auth.userId)
  }

  /**
   * Get all tasks with filtering and pagination
   * GET /tasks
   */
  @Get()
  async findAll(
    @GetAuthContext() auth: AuthContext,
    @Query() filters: TaskFilterDto
  ): Promise<PaginatedTasksResponseDto> {
    // Pass auth context to service for query-level RBAC filtering
    // This ensures pagination counts are accurate
    return this.tasksService.findAll(filters, auth)
  }

  // ============================================================================
  // TEMPLATES (specific paths - MUST come before :id routes)
  // ============================================================================

  /**
   * Get all task templates
   * GET /tasks/templates
   */
  @Get('templates')
  async getTemplates(
    @GetAuthContext() auth: AuthContext,
    @Query('type') templateType?: string,
    @Query('search') search?: string
  ): Promise<TaskTemplateResponseDto[]> {
    return this.templatesService.findAll(auth.agencyId, templateType, search)
  }

  /**
   * Get a single template
   * GET /tasks/templates/:id
   */
  @Get('templates/:id')
  async getTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<TaskTemplateResponseDto> {
    return this.templatesService.findOne(id, auth.agencyId)
  }

  /**
   * Create a new template
   * POST /tasks/templates
   */
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateTaskTemplateDto
  ): Promise<TaskTemplateResponseDto> {
    return this.templatesService.create(dto, auth.agencyId)
  }

  /**
   * Update a template
   * PUT /tasks/templates/:id
   */
  @Put('templates/:id')
  async updateTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaskTemplateDto
  ): Promise<TaskTemplateResponseDto> {
    return this.templatesService.update(id, dto, auth.agencyId)
  }

  /**
   * Delete a template
   * DELETE /tasks/templates/:id
   */
  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTemplate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    return this.templatesService.remove(id, auth.agencyId)
  }

  // ============================================================================
  // SPECIAL OPERATIONS (specific paths - MUST come before :id routes)
  // ============================================================================

  /**
   * Create a task from a template
   * POST /tasks/from-template
   */
  @Post('from-template')
  @HttpCode(HttpStatus.CREATED)
  async createFromTemplate(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: CreateFromTemplateDto
  ): Promise<TaskResponseDto> {
    return this.templatesService.createFromTemplate(dto, auth.agencyId, auth.userId)
  }

  /**
   * Bulk operations on tasks
   * POST /tasks/bulk
   */
  @Post('bulk')
  async bulkOperation(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: BulkTaskOperationDto
  ): Promise<BulkTaskResultDto> {
    // Pass full auth context for per-task access checks
    return this.tasksService.bulkOperation(dto, auth)
  }

  // ============================================================================
  // DYNAMIC ROUTES (:id parameter - MUST come after specific paths)
  // ============================================================================

  /**
   * Get a single task by ID
   * GET /tasks/:id
   */
  @Get(':id')
  async findOne(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<TaskResponseDto> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canView) {
      throw new ForbiddenException('You do not have access to this task')
    }
    return this.tasksService.findOne(id, auth.agencyId)
  }

  /**
   * Update a task
   * PUT /tasks/:id
   */
  @Put(':id')
  async update(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto
  ): Promise<TaskResponseDto> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canEdit) {
      throw new ForbiddenException('You do not have permission to edit this task')
    }
    return this.tasksService.update(id, dto, auth.agencyId, auth.userId)
  }

  /**
   * Partial update a task
   * PATCH /tasks/:id
   */
  @Patch(':id')
  async partialUpdate(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto
  ): Promise<TaskResponseDto> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canEdit) {
      throw new ForbiddenException('You do not have permission to edit this task')
    }
    return this.tasksService.update(id, dto, auth.agencyId, auth.userId)
  }

  /**
   * Delete a task
   * DELETE /tasks/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<void> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canDelete) {
      throw new ForbiddenException('You do not have permission to delete this task')
    }
    return this.tasksService.remove(id, auth.agencyId)
  }

  /**
   * Mark a task as complete
   * POST /tasks/:id/complete
   */
  @Post(':id/complete')
  async complete(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CompleteTaskDto
  ): Promise<TaskResponseDto> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canEdit) {
      throw new ForbiddenException('You do not have permission to complete this task')
    }
    return this.tasksService.complete(id, dto, auth.agencyId, auth.userId)
  }

  /**
   * Get subtasks for a task
   * GET /tasks/:id/subtasks
   */
  @Get(':id/subtasks')
  async getSubtasks(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string
  ): Promise<TaskResponseDto[]> {
    const access = await this.accessService.checkAccess(id, auth)
    if (!access.canView) {
      throw new ForbiddenException('You do not have access to this task')
    }
    return this.tasksService.getSubtasks(id, auth.agencyId)
  }
}
