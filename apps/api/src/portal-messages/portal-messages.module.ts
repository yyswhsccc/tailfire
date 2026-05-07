import { Module } from '@nestjs/common'
import { PortalMessagesController } from './portal-messages.controller'
import { PortalMessagesService } from './portal-messages.service'

@Module({
  controllers: [PortalMessagesController],
  providers: [PortalMessagesService],
  exports: [PortalMessagesService],
})
export class PortalMessagesModule {}
