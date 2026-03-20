import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { AdminRoleGuard } from '../guards/admin-role.guard'

/**
 * Unified admin-only decorator.
 * Combines role metadata + AdminRoleGuard in one decorator.
 * JwtAuthGuard is global, so no need to include it.
 */
export const AdminOnly = () =>
  applyDecorators(
    SetMetadata('roles', ['admin']),
    UseGuards(AdminRoleGuard),
  )
