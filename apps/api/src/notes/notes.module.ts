/**
 * Notes Module
 *
 * Provides the central notes system for contacts and trips.
 * Imports TripsModule for TripAccessService and ContactsModule for ContactsService.
 */

import { Module, forwardRef } from '@nestjs/common'
import { NotesController } from './notes.controller'
import { NotesService } from './notes.service'
import { TripsModule } from '../trips/trips.module'
import { ContactsModule } from '../contacts/contacts.module'

@Module({
  imports: [
    forwardRef(() => TripsModule),
    forwardRef(() => ContactsModule),
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
