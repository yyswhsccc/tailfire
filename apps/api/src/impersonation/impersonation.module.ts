import { Module } from '@nestjs/common'
import { ImpersonationController } from './impersonation.controller'
import { ImpersonationService } from './impersonation.service'

@Module({
  controllers: [ImpersonationController],
  providers: [ImpersonationService],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}
