import { Module } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { LoyaltyProgramsController } from './loyalty-programs.controller'
import { LoyaltyProgramsService } from './loyalty-programs.service'

@Module({
  imports: [DatabaseModule],
  controllers: [LoyaltyProgramsController],
  providers: [LoyaltyProgramsService],
  exports: [LoyaltyProgramsService],
})
export class LoyaltyProgramsModule {}
