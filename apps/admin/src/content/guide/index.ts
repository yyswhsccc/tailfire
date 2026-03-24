const placeholder = (title: string) =>
  `# ${title}\n\nThis guide section is coming soon.`

export const guideContent: Record<string, string> = {
  dashboard: placeholder('Dashboard Overview'),
  trips: placeholder('Managing Trips'),
  'trip-overview': placeholder('Trip Overview'),
  itineraries: placeholder('Building Itineraries'),
  'activity-forms': placeholder('Activity Forms'),
  bookings: placeholder('Booking Activities'),
  payments: placeholder('Payment Schedules'),
  insurance: placeholder('Insurance Coverage'),
  'service-fees': placeholder('Service Fees'),
  documents: placeholder('Documents'),
  tasks: placeholder('Tasks'),
  contacts: placeholder('Managing Contacts'),
  emails: placeholder('Email System'),
  calendar: placeholder('Calendar & Tasks'),
  commissions: placeholder('Commission Tracking'),
  reporting: placeholder('Reports'),
  library: placeholder('Library & Templates'),
  shortcuts: placeholder('Keyboard Shortcuts'),
  tags: placeholder('Tags & Organization'),
}
