/**
 * Contacts Module
 *
 * Provides CRUD operations for the Contact CRM system.
 * Includes contacts, relationships, groups management, and sharing.
 */

import { Module, forwardRef } from '@nestjs/common'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { ContactRelationshipsController } from './contact-relationships.controller'
import { ContactRelationshipsService } from './contact-relationships.service'
import { ContactGroupsController } from './contact-groups.controller'
import { ContactGroupsService } from './contact-groups.service'
import { ContactSharesController } from './contact-shares.controller'
import { ContactSharesService } from './contact-shares.service'
import { ContactAccessService } from './contact-access.service'
import { ActivityLogsModule } from '../activity-logs/activity-logs.module'
import { TripsModule } from '../trips/trips.module'

@Module({
  imports: [
    ActivityLogsModule,
    forwardRef(() => TripsModule), // forwardRef to avoid circular dependency (TripsModule already imports ContactsModule)
  ],
  controllers: [
    ContactsController,
    ContactRelationshipsController,
    ContactGroupsController,
    ContactSharesController,
  ],
  providers: [
    ContactsService,
    ContactRelationshipsService,
    ContactGroupsService,
    ContactSharesService,
    ContactAccessService,
  ],
  exports: [
    ContactsService,
    ContactRelationshipsService,
    ContactGroupsService,
    ContactSharesService,
    ContactAccessService,
  ],
})
export class ContactsModule {}
