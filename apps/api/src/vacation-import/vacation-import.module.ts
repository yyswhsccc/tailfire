import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'
import { VacationImportController } from './vacation-import.controller'
import { VacationImportOrchestratorService } from './services/vacation-import-orchestrator.service'
import { SoftvoyageCatalogClientService } from './services/softvoyage-catalog-client.service'
import { ChangeDetectorService } from './services/change-detector.service'

@Module({
  imports: [ConfigModule, HttpModule.register({ timeout: 30000, maxRedirects: 3 })],
  controllers: [VacationImportController],
  providers: [VacationImportOrchestratorService, SoftvoyageCatalogClientService, ChangeDetectorService],
  exports: [VacationImportOrchestratorService],
})
export class VacationImportModule {}
