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
import { ContactDocumentsController } from './contact-documents.controller'
import { ContactDocumentsService } from './contact-documents.service'
import { ContactLoyaltyProgramsController } from './contact-loyalty-programs.controller'
import { ContactLoyaltyProgramsService } from './contact-loyalty-programs.service'
import { ActivityLogsModule } from '../activity-logs/activity-logs.module'
import { EmailModule } from '../email/email.module'
import { TripsModule } from '../trips/trips.module'

@Module({
  imports: [
    ActivityLogsModule,
    EmailModule,
    forwardRef(() => TripsModule), // forwardRef to avoid circular dependency (TripsModule already imports ContactsModule)
  ],
  controllers: [
    ContactsController,
    ContactRelationshipsController,
    ContactGroupsController,
    ContactSharesController,
    ContactDocumentsController,
    ContactLoyaltyProgramsController,
  ],
  providers: [
    ContactsService,
    ContactRelationshipsService,
    ContactGroupsService,
    ContactSharesService,
    ContactAccessService,
    ContactDocumentsService,
    ContactLoyaltyProgramsService,
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
