export const content = `
## Activity Types and Forms

Activities are the building blocks of an itinerary. Each activity type has a specialized form with fields relevant to that component.

## Available Activity Types

| Type | Use For |
|------|---------|
| **Flight** | Air travel segments with search and manual entry |
| **Lodging** | Hotels, resorts, vacation rentals |
| **Tour** | Guided tours, excursions, day trips |
| **Custom Tour** | Multi-day tour structures with daily breakdowns |
| **Transportation** | Transfers, car rentals, trains, ferries |
| **Cruise** | Cruise itineraries with cabin and port details |
| **Dining** | Restaurant reservations, meal experiences |
| **Options** | Alternative choices for the client to pick from |
| **Port Info** | Informational port-of-call details (not bookable) |
| **Tour Day** | A single day within a multi-day tour structure |
| **Package** | Groups related activities managed as one unit |
| **Insurance** | Travel insurance coverage |

## Common Form Fields

Most activity forms share these fields:

- **Title** — a clear name for the activity
- **Supplier** — the vendor providing the service
- **Start/End Dates and Times** — when the activity occurs
- **Description** and **Notes** — details for the client and internal notes
- **Travelers** — who is included in this activity

## Form Tabs

Each activity form is organized into tabs:

- **General** — core details, dates, supplier, description
- **Media** — photos and images for the client proposal
- **Documents** — uploaded files (confirmations, vouchers, receipts)
- **Booking / Pricing** — supplier pricing, payment schedule, booking status
- **Comments** — internal team discussion about this activity

> **Tip:** Forms auto-save as you work. Look for the save indicator to confirm changes are persisted.

## Flights

Flight activities have a specialized form with segment-level flight search, route-based offer shopping, and manual entry. See the **Flights** section of this guide for details.

## Packages

A **Package** groups child activities that should be managed together. The package controls booking for all its children — do not book child activities individually.

> **Warning:** If an activity belongs to a package, its booking section will be read-only and direct you to the parent package.

## Informational Components

**Port Info** and **Tour Day** are reference items. They do not represent bookable services and are excluded from trip lifecycle calculations.
`
