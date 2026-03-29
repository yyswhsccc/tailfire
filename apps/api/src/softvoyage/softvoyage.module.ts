import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { BullModule } from '@nestjs/bullmq'
import { QUEUES } from '../automation/automation.types'
import { SoftvoyageController } from './softvoyage.controller'
import { SoftvoyageService } from './softvoyage.service'
import { SoftvoyageBrowserPoolService } from './softvoyage-browser-pool.service'
import { SoftvoyageResultParserService } from './softvoyage-result-parser.service'
import { SoftvoyageSearchProcessor } from './softvoyage-search.processor'

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({ name: QUEUES.VACATION_SEARCH }),
  ],
  controllers: [SoftvoyageController],
  providers: [
    SoftvoyageService,
    SoftvoyageBrowserPoolService,
    SoftvoyageResultParserService,
    SoftvoyageSearchProcessor,
  ],
  exports: [SoftvoyageService],
})
export class SoftvoyageModule {}
