import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { VacationEnrichmentModule } from '../vacation-enrichment/vacation-enrichment.module'
import { VacationRepositoryController } from './vacation-repository.controller'
import { VacationRepositoryService } from './vacation-repository.service'

@Module({
  imports: [ConfigModule, VacationEnrichmentModule],
  controllers: [VacationRepositoryController],
  providers: [VacationRepositoryService],
  exports: [VacationRepositoryService],
})
export class VacationRepositoryModule {}
