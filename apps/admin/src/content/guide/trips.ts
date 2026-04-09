export const content = `
## Working with Trips

Trips are the core records in Tailfire. Every client journey lives inside a trip, from the first inquiry through itinerary planning, booking, and follow-up.

## Viewing Trips

The **Trips** page offers three views:

- **Kanban**: cards grouped by lifecycle column
- **Table**: a sortable, filterable list view
- **Group**: trips grouped for shared departures or related work

Important Kanban rule:

- only **Inbound** and **Planning** are manually settable through drag and drop
- **Active**, **Travelling**, and **Travelled** are system-driven states

## Creating a Trip

1. Click **New Trip**.
2. Enter the **Trip Name**.
3. Choose the starting **Status**: **Inbound** or **Planning**.
4. Set the **Trip Type** if your team uses it.
5. Add travel dates, or use **Add Dates Later** if they are still unknown.
6. Set the **Timezone**.
7. Assign a **Trip Group** if needed.
8. Add **Tags**.
9. Optionally choose a **Cover Photo**.
10. Click **Save**.

## Searching and Filtering

- Use the search bar to find trips quickly.
- Filter by status, agent, date range, tags, or trip type.
- Switch between views depending on whether you need lifecycle, list, or grouping context.

## Practical Tips

- Start new work in **Inbound** when the trip still needs qualification or intake.
- Use **Planning** once the trip is an active planning file.
- Do not treat Kanban drag as a full manual lifecycle editor; later states are automated from downstream activity and travel logic.
- Use tags and trip groups instead of overloading the trip name.
`
