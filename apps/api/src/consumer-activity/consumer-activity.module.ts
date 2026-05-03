import { Module } from '@nestjs/common'
import { ConsumerActivityController } from './consumer-activity.controller'
import { ConsumerActivityService } from './consumer-activity.service'

@Module({
  controllers: [ConsumerActivityController],
  providers: [ConsumerActivityService],
  exports: [ConsumerActivityService],
})
export class ConsumerActivityModule {}
