import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { VacationRepositoryController } from './vacation-repository.controller'
import { VacationRepositoryService } from './vacation-repository.service'

@Module({
  imports: [ConfigModule],
  controllers: [VacationRepositoryController],
  providers: [VacationRepositoryService],
  exports: [VacationRepositoryService],
})
export class VacationRepositoryModule {}
