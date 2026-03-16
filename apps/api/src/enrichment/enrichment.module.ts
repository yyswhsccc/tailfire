import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { TripsModule } from '../trips/trips.module'
import { AutomationModule } from '../automation/automation.module'
import { CatalogMatcherModule } from '../catalog-matcher/catalog-matcher.module'
import { EnrichmentController } from './enrichment.controller'
import { EnrichmentService } from './enrichment.service'

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => TripsModule),
    forwardRef(() => AutomationModule),
    CatalogMatcherModule,
  ],
  controllers: [EnrichmentController],
  providers: [EnrichmentService],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
