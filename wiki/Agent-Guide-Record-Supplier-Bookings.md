# Agent Guide: Record Supplier Bookings

This article explains how to record a supplier booking in Tailfire after the agent confirms it off-platform.

## Important Distinction

Client approval is not the same thing as supplier booking.

- Itinerary approval means the client chose the trip option.
- Supplier booking means the advisor actually confirmed the activity or package with the supplier.

Tailfire records supplier booking after that off-platform confirmation happens.

## Current Booking Paths

Tailfire currently has two booking paths:

- `Standalone activities`: mark the activity as booked from the activity record.
- `Packages`: manage booking from the package record, not from the child activities.

If an activity belongs to a package, the child booking section becomes read-only and points you back to the parent package.

## Recommended Workflow

1. Confirm the final itinerary option internally.
2. Book the activity or package with the supplier outside Tailfire.
3. Return to Tailfire and open the correct record.
4. Record supplier-facing details already supported by that form, such as confirmation number, booking date, or notes.
5. Mark the item as booked using the correct path.
6. Add or review the payment schedule for that booked item.
7. Record any payments separately.

## How To Mark A Standalone Activity As Booked

1. Open the activity record.
2. Use the booking status control.
3. Enter the booking date.
4. Save the change.

For standalone activities, the current booked action is mainly a booking flag plus booking date. If the UI warns that no payment schedule exists yet, add the payment schedule next.

## How To Mark A Package As Booked

1. Open the package record.
2. Use the package `Mark as Booked` action.
3. Enter the supplier confirmation number.
4. Confirm the booking date.
5. The package modal also shows an optional payment-status field, but payment schedules and actual payments are still separate follow-up workflows.
6. Save the package booking.

Package-linked child activities inherit that package booking context and should be managed from the parent package.

## What To Capture When Possible

- supplier confirmation number
- booking date
- supplier notes or internal notes
- payment schedule
- payments actually received or applied

## What Not To Do

- Do not treat itinerary approval as proof that the supplier booking happened.
- Do not mark package child activities separately when the package controls booking.
- Do not leave payment tracking for later if the booked action warns that no payment schedule exists.
- Do not assume every informational activity needs to be booked. Some records are reference-only.

## Related Articles

- [Build And Propose An Itinerary](./Agent-Guide-Build-And-Propose-An-Itinerary.md)
- [Payment Schedules](./Agent-Guide-Payment-Schedules.md)
- [Service Fees](./Agent-Guide-Service-Fees.md)
- [Trip Workflow](./Trip-Workflow.md)
