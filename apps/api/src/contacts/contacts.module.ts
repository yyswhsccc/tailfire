/**
 * Contacts Module
 *
 * Provides CRUD operations for the Contact CRM system.
 * Includes contacts, relationships, groups management, sharing, and import.
 */

import { Module, forwardRef } from '@nestjs/common'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { ContactImportController } from './contact-import.controller'
import { ContactImportService } from './contact-import.service'
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
import { ContactShareRequestsController } from './contact-share-requests.controller'
import { ContactShareRequestsService } from './contact-share-requests.service'
import { ActivityLogsModule } from '../activity-logs/activity-logs.module'
import { EmailModule } from '../email/email.module'
import { TagsModule } from '../tags/tags.module'
import { TripsModule } from '../trips/trips.module'

@Module({
  imports: [
    ActivityLogsModule,
    EmailModule,
    TagsModule,
    forwardRef(() => TripsModule), // forwardRef to avoid circular dependency (TripsModule already imports ContactsModule)
  ],
  controllers: [
    ContactImportController, // BEFORE ContactsController so /contacts/import matches before /contacts/:id
    ContactsController,
    ContactRelationshipsController,
    ContactGroupsController,
    ContactSharesController,
    ContactDocumentsController,
    ContactLoyaltyProgramsController,
    ContactShareRequestsController,
  ],
  providers: [
    ContactsService,
    ContactImportService,
    ContactRelationshipsService,
    ContactGroupsService,
    ContactSharesService,
    ContactAccessService,
    ContactDocumentsService,
    ContactLoyaltyProgramsService,
    ContactShareRequestsService,
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
