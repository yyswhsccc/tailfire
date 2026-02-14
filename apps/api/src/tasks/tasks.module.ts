/**
 * Tasks Module
 *
 * Provides task management functionality including:
 * - Task CRUD operations
 * - Task templates
 * - Access control
 */

import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { TaskTemplatesService } from './task-templates.service'
import { TaskAccessService } from './task-access.service'

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskTemplatesService, TaskAccessService],
  exports: [TasksService, TaskTemplatesService, TaskAccessService],
})
export class TasksModule {}
