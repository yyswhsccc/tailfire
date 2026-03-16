/**
 * Tags Module
 *
 * Provides multi-tenant tag management and entity tag assignment functionality.
 * Imports access services for entity-level permission checks on tag endpoints.
 */

import { Module } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { TagsService } from './tags.service'
import {
  TagsController,
  TripTagsController,
  ContactTagsController,
  CalendarEventTagsController,
} from './tags.controller'
import { TripAccessService } from '../trips/trip-access.service'
import { TripGroupAccessService } from '../trips/trip-group-access.service'
import { ContactAccessService } from '../contacts/contact-access.service'

@Module({
  imports: [DatabaseModule],
  controllers: [
    TagsController,
    TripTagsController,
    ContactTagsController,
    CalendarEventTagsController,
  ],
  providers: [TagsService, TripAccessService, TripGroupAccessService, ContactAccessService],
  exports: [TagsService],
})
export class TagsModule {}
