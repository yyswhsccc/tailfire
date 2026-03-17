/**
 * API Request/Response Types
 *
 * Shared types for REST API contracts between frontend and backend.
 * These types are used for:
 * - NestJS DTOs (request validation)
 * - Frontend API client (type-safe requests)
 * - Zod schemas (runtime validation)
 *
 * Organization:
 * - common.types.ts: Shared pagination, filtering, sorting types
 * - contacts.types.ts: Contact-related API types (Phase 3)
 * - trips.types.ts: Trip-related API types (Phase 3)
 * - bookings.types.ts: Booking-related API types (Phase 3+)
 * - auth.types.ts: Authentication API types (Phase 2)
 */

// Common types
export * from './common.types.js'

// Phase 3: Contacts & Trips & Tags & Itineraries
export * from './contacts.types.js'
export * from './trips.types.js'
export * from './trip-status-transitions.js'
export * from './tags.types.js'
export * from './itinerary-days.types.js'
export * from './activities.types.js'
export * from './components.types.js'
export * from './payment-schedules.types.js'
export * from './api-credentials.types.js'
export * from './media.types.js'

// Financial System (Phase 4)
export * from './financials.types.js'

// Insurance (Phase 4)
export * from './insurance.types.js'

// Activity Bookings (booking status management for activities)
// Note: Packages are now an activity type (activityType='package'), managed via activities API
export * from './activity-bookings.types.js'

// Flight Search (External APIs)
export * from './flights.types.js'

// Hotel Search (External APIs)
export * from './hotels.types.js'

// Transfer Search (External APIs)
export * from './transfers.types.js'

// Tours & Activities Search (External APIs)
export * from './tours-activities.types.js'

// Amenities (dynamic, API-driven)
export * from './amenities.types.js'

// Templates (Itinerary & Package Library)
export * from './templates.types.js'

// User Profiles (MVP)
export * from './user-profiles.types.js'

// User Management (Admin)
export * from './users.types.js'

// Email System (Send, Log, Templates)
export * from './email.types.js'

// Email Accounts (Agent personal IMAP/SMTP — separate from EmailModule)
export * from './email-accounts.types.js'

// Geolocation (Cascade System)
export * from './geolocation.types.js'

// Suppliers
export * from './suppliers.types.js'

// Notifications
export * from './notifications.types.js'

// Activity Logs
export * from './activity-logs.types.js'

// Task System
export * from './tasks.types.js'

// Calendar System
export * from './calendar.types.js'

// Notes System
export * from './notes.types.js'

// Calendar Events (standalone meetings, calls, follow-ups)
export * from './calendar-events.types.js'

// OCR Document Import
export * from './ocr-import.types.js'

// Loyalty Programs Catalog (Library)
export * from './loyalty-programs.types.js'

// Commission System
export * from './commission.types.js'

// Future exports:
// export * from './auth.types'
