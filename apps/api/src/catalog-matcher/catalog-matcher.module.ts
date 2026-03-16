import { Module } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { CatalogMatcherService } from './catalog-matcher.service'

@Module({
  imports: [DatabaseModule],
  providers: [CatalogMatcherService],
  exports: [CatalogMatcherService],
})
export class CatalogMatcherModule {}
