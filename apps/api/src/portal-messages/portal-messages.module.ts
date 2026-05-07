import { Module } from '@nestjs/common'
import { PortalMessagesController, AdminPortalMessagesController } from './portal-messages.controller'
import { PortalMessagesService } from './portal-messages.service'

@Module({
  controllers: [PortalMessagesController, AdminPortalMessagesController],
  providers: [PortalMessagesService],
  exports: [PortalMessagesService],
})
export class PortalMessagesModule {}
