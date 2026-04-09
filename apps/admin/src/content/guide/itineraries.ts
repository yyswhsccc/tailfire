export const content = `
## Building Itineraries

An itinerary is the day-by-day proposal for a trip. Each trip can have more than one itinerary option so you can compare different client-facing proposals.

## Creating an Itinerary

1. Open the trip and go to the **Itinerary** tab.
2. Click **Create** for a blank option or **Import** to pull an itinerary template from the library.
3. Give the itinerary a clear name.

## Adding Days and Activities

- Add itinerary days as needed.
- Build each day with activities, packages, and other trip components.
- Duplicate strong options when you want a quick variation.
- Use **Save as Template** when an itinerary should become reusable library content.

## Itinerary Statuses

| Status | Meaning |
| --- | --- |
| **Draft** | Internal work in progress |
| **Proposing** | Ready for active client review |
| **Approved** | Client-selected winning option |
| **Archived** | Retired option kept for reference |

## Publishing To The Client

**Publish to Client** creates a versioned snapshot for the client-facing proposal.

When you publish:

1. Tailfire creates the next proposal version.
2. The published snapshot becomes visible on the shared proposal link.
3. You can include a change summary.

Important rule:

- live edits are not automatically visible to the client
- after client-visible changes, publish again to update the shared proposal

## Practical Rules

- Trip stage and itinerary status are separate.
- A trip can still be in **Planning** while an itinerary is **Proposing** or **Approved**.
- Publishing an itinerary does not record a supplier booking.
- Keep only active client options in **Proposing**; archive stale alternatives.
`
