# Codex Review Fixes — Transportation Refactor Plan

Apply these during execution:

## 1. Google API key name (HIGH)
Existing `LocationAutocomplete` uses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, NOT `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`. Use the correct key name in the new `TransportationAddressInput` component.

## 2. Explicit field mapping in service (HIGH)
`transportation-details.service.ts` uses explicit field maps in `create()` and `update()`. Every new column must be explicitly added:
- `pickupName`, `pickupLat`, `pickupLng`, `pickupPlaceId`
- `dropoffName`, `dropoffLat`, `dropoffLng`, `dropoffPlaceId`
- `rentalCompany`, `rentalBookingRef`, `rentalCarClass`, `rentalFuelPolicy`
- `departureStation`, `arrivalStation`

## 3. Snapshot builder field copy (HIGH)
`trips.service.ts` `buildProposalItinerary()` explicitly maps transportation detail fields for published snapshots. Add new columns to the snapshot mapper too.

## 4. Validation test updates (MEDIUM)
Update `transportation-validation.test.ts` and `TRANSPORTATION_FORM_FIELDS` in `transportation-validation.ts` for server error mapping.

## 5. Fix column count text (MEDIUM)
Architecture section says "8 new columns" — should say "14 new columns".

## 6. Stale field policy
When subtype changes, clear fields that don't apply to the new subtype. E.g., switching from `car_rental` to `transfer` should clear `rentalCompany`, `rentalCarClass`, etc.

## 7. Auto-fill guard
Pre-fill (flight number, pickup/dropoff from day locations) should only populate EMPTY fields. Never overwrite user-edited values.
