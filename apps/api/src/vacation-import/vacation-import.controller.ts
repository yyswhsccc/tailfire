import { Controller, Post, Get, UseGuards } from '@nestjs/common'
import { ApiTags, ApiHeader } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { InternalApiKeyGuard } from '../cruise-import/guards/internal-api-key.guard'
import { VacationImportOrchestratorService } from './services/vacation-import-orchestrator.service'

@ApiTags('Vacation Import')
@Controller('vacation-import')
@Public() // Bypass JWT auth
@UseGuards(InternalApiKeyGuard) // Require internal API key instead
@ApiHeader({
  name: 'x-internal-api-key',
  description: 'Internal API key for vacation catalog sync operations',
  required: true,
})
export class VacationImportController {
  constructor(
    private readonly orchestrator: VacationImportOrchestratorService,
  ) {}

  @Post('sync')
  async triggerSync() {
    return this.orchestrator.runSync()
  }

  @Post('sync/dry-run')
  async triggerDryRun() {
    return this.orchestrator.runSync({ dryRun: true })
  }

  @Get('sync/status')
  async getSyncStatus() {
    return this.orchestrator.getSyncStatus()
  }
}
