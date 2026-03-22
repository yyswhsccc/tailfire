import { Module } from '@nestjs/common'
import { TripsModule } from '../trips/trips.module'
import { ContactsModule } from '../contacts/contacts.module'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'

@Module({
  imports: [TripsModule, ContactsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
