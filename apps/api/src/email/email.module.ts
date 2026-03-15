import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { DocumentTemplatesModule } from '../document-templates/document-templates.module'
import { EmailAccountsModule } from '../email-accounts/email-accounts.module'
import { EmailService } from './email.service'
import { EmailTemplatesService } from './email-templates.service'
import { VariableResolverService } from './variable-resolver.service'
import { EmailController } from './email.controller'
import { EmailTemplatesController } from './email-templates.controller'

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => DocumentTemplatesModule),
    forwardRef(() => EmailAccountsModule),
  ],
  providers: [EmailService, EmailTemplatesService, VariableResolverService],
  controllers: [EmailController, EmailTemplatesController],
  exports: [EmailService, EmailTemplatesService, VariableResolverService],
})
export class EmailModule {}
