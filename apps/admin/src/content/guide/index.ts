import { content as dashboard } from './dashboard'
import { content as trips } from './trips'
import { content as tripOverview } from './trip-overview'
import { content as itineraries } from './itineraries'
import { content as activityForms } from './activity-forms'
import { content as bookings } from './bookings'
import { content as payments } from './payments'
import { content as insurance } from './insurance'
import { content as serviceFees } from './service-fees'
import { content as documents } from './documents'
import { content as tasks } from './tasks'
import { content as contacts } from './contacts'
import { content as emails } from './emails'
import { content as calendar } from './calendar'
import { content as commissions } from './commissions'
import { content as reporting } from './reporting'
import { content as library } from './library'
import { content as tags } from './tags'
import { content as shortcuts } from './shortcuts'

export const guideContent: Record<string, string> = {
  dashboard,
  trips,
  'trip-overview': tripOverview,
  itineraries,
  'activity-forms': activityForms,
  bookings,
  payments,
  insurance,
  'service-fees': serviceFees,
  documents,
  tasks,
  contacts,
  emails,
  calendar,
  commissions,
  reporting,
  library,
  tags,
  shortcuts,
}
