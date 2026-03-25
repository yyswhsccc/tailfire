/**
 * Forms Module
 *
 * Token-based public form system for insurance waivers, intake forms, etc.
 */

import { Module } from '@nestjs/common'
import { FormsService } from './forms.service'
import { FormsController } from './forms.controller'
import { DatabaseModule } from '../db/database.module'

@Module({
  imports: [DatabaseModule],
  providers: [FormsService],
  controllers: [FormsController],
  exports: [FormsService],
})
export class FormsModule {}
