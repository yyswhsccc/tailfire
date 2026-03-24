# Transportation Activity Refactor

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the transportation activity form with subtype-conditional fields, Google Address Autocomplete with trip location suggestions, structured location data (lat/lng/placeId), flight auto-linking, and enhanced car rental fields aligned with the Amadeus Transfer API.

**Architecture:** Add 8 new columns to `transportation_details` for structured location data. Create a reusable `TransportationAddressInput` component that combines Google Places Autocomplete with trip location suggestions. Refactor the form to show/hide sections based on subtype. Add an API endpoint to fetch trip locations for suggestions. Pre-fill pickup/dropoff from day locations and flights.

**Tech Stack:** NestJS (API), Drizzle ORM, Next.js (Admin), React Hook Form, Google Places API v1, `LocationAutocomplete` component (existing)

---

## Business Rules

### Subtype-Conditional Form Sections

| Section | transfer | taxi | private_car | limousine | shuttle | train | ferry | bus | car_rental |
|---------|----------|------|-------------|-----------|---------|-------|-------|-----|------------|
| Provider Info | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pickup/Dropoff Address | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pickup/Dropoff Date+Time | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Flight Number | ✓ | - | - | - | ✓ | - | - | - | - |
| Vehicle Details | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - |
| Driver Info | ✓ | - | ✓ | ✓ | - | - | - | - | - |
| Car Rental Details | - | - | - | - | - | - | - | - | ✓ |
| Transfer Search | ✓ | - | - | - | - | - | - | - | - |
| Station/Terminal Name | - | - | - | - | - | ✓ | ✓ | ✓ | - |
| Round Trip | ✓ | - | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| Features | ✓ | - | ✓ | ✓ | - | - | - | - | - |

### Address Autocomplete Behavior
1. When agent opens pickup/dropoff address field, show **trip location suggestions first** (hotels, airports, ports from the itinerary) above Google autocomplete results
2. Pre-fill pickup address from previous day's hotel or day start location (best guess from geocode)
3. Pre-fill dropoff address from current day's hotel or day end location
4. Google Places Autocomplete searches all address types (not just cities)
5. Capture structured data: address text, lat, lng, Google Place ID, venue name

### Flight Auto-Linking
1. For `transfer` and `shuttle` subtypes, auto-detect flights on the same day
2. Pre-fill flight number from the first departure/arrival flight segment on that day
3. Agent can edit/override the pre-filled value

### Car Rental Enhanced Fields (aligned with Amadeus)
- Rental company name
- Booking/confirmation reference
- Car class (economy, compact, midsize, standard, full-size, premium, luxury, SUV, minivan, convertible)
- Rental pickup/dropoff locations (with address autocomplete)
- Insurance type (basic, full, premium, none)
- Mileage limit (unlimited, limited)
- Fuel policy (full-to-full, prepaid, same-to-same)

---

## Schema Changes

### New columns on `transportation_details`

```sql
ALTER TABLE transportation_details
  ADD COLUMN pickup_name varchar(255),           -- Venue/location name
  ADD COLUMN pickup_lat numeric(9, 6),           -- Latitude
  ADD COLUMN pickup_lng numeric(10, 6),          -- Longitude
  ADD COLUMN pickup_place_id varchar(255),       -- Google Place ID
  ADD COLUMN dropoff_name varchar(255),
  ADD COLUMN dropoff_lat numeric(9, 6),
  ADD COLUMN dropoff_lng numeric(10, 6),
  ADD COLUMN dropoff_place_id varchar(255),
  ADD COLUMN rental_company varchar(255),        -- Car rental company name
  ADD COLUMN rental_booking_ref varchar(100),    -- Rental booking reference
  ADD COLUMN rental_car_class varchar(50),       -- economy, compact, midsize, etc.
  ADD COLUMN rental_fuel_policy varchar(50),     -- full-to-full, prepaid, same-to-same
  ADD COLUMN departure_station varchar(255),     -- Train/ferry/bus departure station/terminal
  ADD COLUMN arrival_station varchar(255);       -- Train/ferry/bus arrival station/terminal
```

---

## File Structure

### Database — New
| File | Purpose |
|------|---------|
| `packages/database/src/migrations/YYYYMMDDHHMMSS_transportation_location_fields.sql` | Add 14 new columns |

### Database — Modify
| File | Purpose |
|------|---------|
| `packages/database/src/schema/transportation-details.schema.ts` | Add new column definitions |

### Shared Types — Modify
| File | Purpose |
|------|---------|
| `packages/shared-types/src/schemas/transportation.schema.ts` | Add new fields to DTO schema |

### API — Modify
| File | Purpose |
|------|---------|
| `apps/api/src/trips/transportation-details.service.ts` | Handle new fields in create/update |
| `apps/api/src/trips/trips.controller.ts` | Add `GET /trips/:id/locations` endpoint |
| `apps/api/src/trips/trips.service.ts` | Implement `getTripLocations()` method |

### Admin — New
| File | Purpose |
|------|---------|
| `apps/admin/src/components/transportation/transportation-address-input.tsx` | Address input with Google autocomplete + trip location suggestions |
| `apps/admin/src/hooks/use-trip-locations.ts` | Hook to fetch trip locations for suggestions |

### Admin — Modify
| File | Purpose |
|------|---------|
| `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx` | Subtype-conditional sections, address inputs, flight pre-fill, car rental fields |
| `apps/admin/src/lib/validation/transportation-validation.ts` | Add new field validations |

---

## Chunk 1: Schema & Migration

### Task 1: Database migration + schema update

- [ ] **Step 1: Create migration file**

File: `packages/database/src/migrations/YYYYMMDDHHMMSS_transportation_location_fields.sql`

```sql
-- Add structured location data to transportation_details
-- Supports Google Places integration and Amadeus Transfer API

ALTER TABLE transportation_details
  ADD COLUMN IF NOT EXISTS pickup_name varchar(255),
  ADD COLUMN IF NOT EXISTS pickup_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS pickup_lng numeric(10, 6),
  ADD COLUMN IF NOT EXISTS pickup_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS dropoff_name varchar(255),
  ADD COLUMN IF NOT EXISTS dropoff_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS dropoff_lng numeric(10, 6),
  ADD COLUMN IF NOT EXISTS dropoff_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS rental_company varchar(255),
  ADD COLUMN IF NOT EXISTS rental_booking_ref varchar(100),
  ADD COLUMN IF NOT EXISTS rental_car_class varchar(50),
  ADD COLUMN IF NOT EXISTS rental_fuel_policy varchar(50),
  ADD COLUMN IF NOT EXISTS departure_station varchar(255),
  ADD COLUMN IF NOT EXISTS arrival_station varchar(255);
```

- [ ] **Step 2: Register migration in `packages/database/src/migrations/meta/_journal.json`**

- [ ] **Step 3: Update Drizzle schema** at `packages/database/src/schema/transportation-details.schema.ts`

Add columns after existing fields:

```typescript
// Structured pickup location (for Google Places + Amadeus)
pickupName: varchar('pickup_name', { length: 255 }),
pickupLat: numeric('pickup_lat', { precision: 9, scale: 6 }),
pickupLng: numeric('pickup_lng', { precision: 10, scale: 6 }),
pickupPlaceId: varchar('pickup_place_id', { length: 255 }),

// Structured dropoff location
dropoffName: varchar('dropoff_name', { length: 255 }),
dropoffLat: numeric('dropoff_lat', { precision: 9, scale: 6 }),
dropoffLng: numeric('dropoff_lng', { precision: 10, scale: 6 }),
dropoffPlaceId: varchar('dropoff_place_id', { length: 255 }),

// Enhanced car rental fields
rentalCompany: varchar('rental_company', { length: 255 }),
rentalBookingRef: varchar('rental_booking_ref', { length: 100 }),
rentalCarClass: varchar('rental_car_class', { length: 50 }),
rentalFuelPolicy: varchar('rental_fuel_policy', { length: 50 }),

// Station/terminal for train, ferry, bus
departureStation: varchar('departure_station', { length: 255 }),
arrivalStation: varchar('arrival_station', { length: 255 }),
```

- [ ] **Step 4: Update shared types** at `packages/shared-types/src/schemas/transportation.schema.ts`

Add new optional fields to the DTO schema:

```typescript
pickupName: z.string().nullable().optional(),
pickupLat: z.number().nullable().optional(),
pickupLng: z.number().nullable().optional(),
pickupPlaceId: z.string().nullable().optional(),
dropoffName: z.string().nullable().optional(),
dropoffLat: z.number().nullable().optional(),
dropoffLng: z.number().nullable().optional(),
dropoffPlaceId: z.string().nullable().optional(),
rentalCompany: z.string().nullable().optional(),
rentalBookingRef: z.string().nullable().optional(),
rentalCarClass: z.string().nullable().optional(),
rentalFuelPolicy: z.string().nullable().optional(),
departureStation: z.string().nullable().optional(),
arrivalStation: z.string().nullable().optional(),
```

- [ ] **Step 5: Run migration locally** — `cd apps/api && pnpm db:migrate`

- [ ] **Step 6: Verify TypeScript compiles** — `pnpm turbo typecheck`

- [ ] **Step 7: Commit**

---

## Chunk 2: Trip Locations API

### Task 2: API endpoint for trip location suggestions

This endpoint returns all known locations from a trip's activities (hotels, airports, ports) for use as autocomplete suggestions.

- [ ] **Step 1: Add `getTripLocations` method** to `apps/api/src/trips/trips.service.ts`

Returns an array of locations from:
- Lodging activities: property name + address + coordinates
- Flight segments: departure/arrival airport name + code + coordinates
- Port info: port name + coordinates
- Itinerary days: start/end location names + coordinates

```typescript
interface TripLocation {
  type: 'hotel' | 'airport' | 'port' | 'day_location'
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  iataCode?: string // for airports
  dayNumber?: number // which day this is on
}

async getTripLocations(tripId: string): Promise<TripLocation[]>
```

- [ ] **Step 2: Add controller endpoint** at `apps/api/src/trips/trips.controller.ts`

```typescript
@Get(':id/locations')
async getTripLocations(
  @GetAuthContext() auth: AuthContext,
  @Param('id') id: string,
) {
  await this.tripAccessService.verifyReadAccess(id, auth)
  return this.tripsService.getTripLocations(id)
}
```

- [ ] **Step 3: Verify it compiles** — `npx tsc --noEmit --project apps/api/tsconfig.json`

- [ ] **Step 4: Commit**

### Task 3: Admin hook for trip locations

- [ ] **Step 1: Create `apps/admin/src/hooks/use-trip-locations.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface TripLocation {
  type: 'hotel' | 'airport' | 'port' | 'day_location'
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  iataCode?: string
  dayNumber?: number
}

export function useTripLocations(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId, 'locations'],
    queryFn: () => api.get<TripLocation[]>(`/trips/${tripId}/locations`),
    enabled: !!tripId,
    staleTime: 60_000, // Cache for 1 minute
  })
}
```

- [ ] **Step 2: Commit**

---

## Chunk 3: Address Input Component

### Task 4: Create TransportationAddressInput component

This combines Google Places Autocomplete with trip location suggestions. Trip locations appear above Google results.

- [ ] **Step 1: Create `apps/admin/src/components/transportation/transportation-address-input.tsx`**

Props:
```typescript
interface TransportationAddressInputProps {
  value: string
  onChange: (location: {
    address: string
    name: string | null
    lat: number | null
    lng: number | null
    placeId: string | null
  }) => void
  tripLocations: TripLocation[]
  placeholder?: string
  label?: string
}
```

Behavior:
- When focused/typing, show two sections:
  1. **"Trip Locations"** — filtered list of hotels/airports/ports from the trip
  2. **"Search Results"** — Google Places API results (debounced 300ms)
- When a trip location is selected, populate address + name + lat/lng
- When a Google result is selected, fetch place details for lat/lng/placeId
- Uses the existing `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` (or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- Keyboard navigation (arrow keys, enter, escape)

- [ ] **Step 2: Verify it compiles**

- [ ] **Step 3: Commit**

---

## Chunk 4: Form Refactor

### Task 5: Update validation schema

- [ ] **Step 1: Add new fields to `apps/admin/src/lib/validation/transportation-validation.ts`**

```typescript
// Structured location fields
pickupName: z.string().nullable().optional().default(null),
pickupLat: z.coerce.number().nullable().optional().default(null),
pickupLng: z.coerce.number().nullable().optional().default(null),
pickupPlaceId: z.string().nullable().optional().default(null),
dropoffName: z.string().nullable().optional().default(null),
dropoffLat: z.coerce.number().nullable().optional().default(null),
dropoffLng: z.coerce.number().nullable().optional().default(null),
dropoffPlaceId: z.string().nullable().optional().default(null),

// Enhanced car rental
rentalCompany: z.string().nullable().optional().default(null),
rentalBookingRef: z.string().nullable().optional().default(null),
rentalCarClass: z.string().nullable().optional().default(null),
rentalFuelPolicy: z.string().nullable().optional().default(null),

// Station/terminal
departureStation: z.string().nullable().optional().default(null),
arrivalStation: z.string().nullable().optional().default(null),
```

- [ ] **Step 2: Update `toTransportationDefaults()` and `toTransportationApiPayload()`** to include new fields

- [ ] **Step 3: Add new fields to AUTO_SAVE_FIELDS** in transportation-form.tsx

- [ ] **Step 4: Commit**

### Task 6: Refactor transportation form — subtype-conditional rendering

This is the main UI task. Refactor `apps/admin/src/app/trips/[id]/_components/transportation-form.tsx`.

- [ ] **Step 1: Add subtype constants and section visibility map**

```typescript
const SUBTYPE_SECTIONS = {
  transfer: ['provider', 'pickup', 'dropoff', 'vehicle', 'driver', 'flight', 'features', 'roundTrip', 'transferSearch'],
  taxi: ['provider', 'pickup', 'dropoff', 'vehicle'],
  private_car: ['provider', 'pickup', 'dropoff', 'vehicle', 'driver', 'features', 'roundTrip'],
  limousine: ['provider', 'pickup', 'dropoff', 'vehicle', 'driver', 'features', 'roundTrip'],
  shuttle: ['provider', 'pickup', 'dropoff', 'flight', 'roundTrip'],
  train: ['provider', 'pickup', 'dropoff', 'station', 'roundTrip'],
  ferry: ['provider', 'pickup', 'dropoff', 'station', 'roundTrip'],
  bus: ['provider', 'pickup', 'dropoff', 'station', 'roundTrip'],
  car_rental: ['provider', 'pickup', 'dropoff', 'carRental'],
} as const

function showSection(subtype: string | null, section: string): boolean {
  if (!subtype) return true // Show all when no subtype selected
  return SUBTYPE_SECTIONS[subtype]?.includes(section) ?? false
}
```

- [ ] **Step 2: Replace plain pickup/dropoff `<Input>` with `<TransportationAddressInput>`**

Wire trip locations from `useTripLocations(tripId)`. When a location is selected, update:
- `transportationDetails.pickupAddress` (text)
- `transportationDetails.pickupName` (venue name)
- `transportationDetails.pickupLat` / `pickupLng` (coordinates)
- `transportationDetails.pickupPlaceId` (Google Place ID)

Same for dropoff.

- [ ] **Step 3: Add station/terminal fields for train/ferry/bus**

Show when subtype is `train`, `ferry`, or `bus`:
```tsx
{showSection(subtypeValue, 'station') && (
  <Card>
    <CardHeader><CardTitle>Station / Terminal</CardTitle></CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label>Departure Station</label>
          <Input {...register('transportationDetails.departureStation')} />
        </div>
        <div className="space-y-2">
          <label>Arrival Station</label>
          <Input {...register('transportationDetails.arrivalStation')} />
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

Pre-fill departure station with best guess from day's geocode (nearest station via Google Places with `types: ['train_station', 'transit_station']`).

- [ ] **Step 4: Enhance car rental section**

Add new fields: rental company, booking ref, car class (combobox with allowCustom), fuel policy (select).

```typescript
const CAR_CLASSES = [
  { value: 'economy', label: 'Economy' },
  { value: 'compact', label: 'Compact' },
  { value: 'midsize', label: 'Midsize' },
  { value: 'standard', label: 'Standard' },
  { value: 'full_size', label: 'Full Size' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'suv', label: 'SUV' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'convertible', label: 'Convertible' },
]

const FUEL_POLICIES = [
  { value: 'full_to_full', label: 'Full to Full' },
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'same_to_same', label: 'Same to Same' },
]
```

- [ ] **Step 5: Add flight auto-linking for transfer/shuttle subtypes**

When subtype is `transfer` or `shuttle`:
1. Fetch flights for the current day via the itinerary data
2. If a flight exists on the same day, pre-fill `flightNumber` with the flight segment's airline code + flight number
3. Show the flight number field with a "Linked to: AC860" indicator
4. Allow agent to clear/override

- [ ] **Step 6: Wrap all conditional sections with `showSection()` checks**

Apply visibility rules to each form section based on the subtype matrix.

- [ ] **Step 7: Pre-fill pickup/dropoff from day locations**

When creating a new transportation activity:
- Pickup: previous day's end location (hotel address) or current day's start location
- Dropoff: current day's end location or next day's start location (hotel address)

Use data from `useTripLocations(tripId)` filtered by day number.

- [ ] **Step 8: Verify TypeScript compiles** — `npx tsc --noEmit --project apps/admin/tsconfig.json`

- [ ] **Step 9: Commit**

---

## Chunk 5: API Field Handling

### Task 7: Update transportation details service

- [ ] **Step 1: Update `apps/api/src/trips/transportation-details.service.ts`**

Ensure `create()` and `update()` methods pass through new fields:
- `pickupName`, `pickupLat`, `pickupLng`, `pickupPlaceId`
- `dropoffName`, `dropoffLat`, `dropoffLng`, `dropoffPlaceId`
- `rentalCompany`, `rentalBookingRef`, `rentalCarClass`, `rentalFuelPolicy`
- `departureStation`, `arrivalStation`

Also ensure `findByActivityId()` returns them.

- [ ] **Step 2: Verify TypeScript compiles**

- [ ] **Step 3: Commit**

---

## Summary

| Task | What | Depends On |
|------|------|------------|
| 1 | Schema migration + Drizzle schema + shared types | — |
| 2 | Trip locations API endpoint | — |
| 3 | Admin hook for trip locations | 2 |
| 4 | TransportationAddressInput component | 3 |
| 5 | Validation schema update + auto-save fields | 1 |
| 6 | Form refactor (conditional sections, address, flight, car rental) | 1, 4, 5 |
| 7 | API service field handling | 1 |

**Dependencies:**
- Task 1 must be first (schema changes)
- Tasks 2-3 are for trip locations (can parallel with 1)
- Task 4 depends on 3 (needs hook)
- Tasks 5-6 are the main form work (depend on 1 and 4)
- Task 7 can run after 1

---

## Amadeus Transfer API Compatibility

This refactor stores structured location data that maps directly to the Amadeus Transfer Search API:

| Our Field | Amadeus Request Field |
|-----------|----------------------|
| `pickupAddress` | `startAddressLine` |
| `pickupLat` + `pickupLng` | `startGeoCode` (comma-separated) |
| `pickupPlaceId` | `startGooglePlaceId` |
| `pickupName` | `startName` |
| `dropoffAddress` | `endAddressLine` |
| `dropoffLat` + `dropoffLng` | `endGeoCode` |
| `dropoffPlaceId` | `endGooglePlaceId` |
| `dropoffName` | `endName` |
| `flightNumber` | `startConnectedSegment.transportationNumber` |
| `subtype` → transfer | `transferType` → PRIVATE/SHARED |
| `subtype` → taxi | `transferType` → TAXI |
| `subtype` → shuttle | `transferType` → AIRPORT_BUS |
| `subtype` → train | `transferType` → AIRPORT_EXPRESS |

This means when we later integrate Amadeus Transfer Search, we can construct the API request directly from the form data without any additional geocoding or data transformation.

---

## Future Considerations (Out of Scope)

- **Amadeus Transfer Search integration** — connect the existing Transfer Search Panel to use the new structured location data
- **Amadeus Rail/Train search** — when Amadeus releases a dedicated rail API
- **Car rental search** — when Amadeus Self-Service car rental API becomes available
- **Real-time station lookup** — query Google Places for nearest train stations based on geocode
