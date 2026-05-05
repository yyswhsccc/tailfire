import { Module } from '@nestjs/common'
import { ConsumerActivityController } from './consumer-activity.controller'
import { ConsumerActivityService } from './consumer-activity.service'
import { OtaServiceKeyGuard } from '../ota/guards/ota-service-key.guard'

@Module({
  controllers: [ConsumerActivityController],
  providers: [ConsumerActivityService, OtaServiceKeyGuard],
  exports: [ConsumerActivityService],
})
export class ConsumerActivityModule {}
