# Agent Guide: Flight Activities

This article explains how to use the flight activity form, including the current segment-level search flow and the separate flight-offers search.

## Two Different Search Tools

Flight activities now have two distinct search paths:

1. `Segment Search`
   Use this when you already know the flight you want and want Tailfire to fill the segment details.

2. `Search Flight Offers`
   Use this when you want route-based price shopping and multiple offer options before choosing the segments.

These are related, but they are not the same workflow.

## Segment Search

Each flight segment card can start in search mode.

Current search fields:

- `Flight Date`
- `Airline / Airline Code`
- `Flight Number`

Current search behavior:

- Click `Search` on the segment card to search that specific leg.
- Tailfire first loads the standard flight-search results for that segment.
- If you want more results, use `More Results (Amadeus)`.
- When you apply a result, Tailfire fills the segment with the returned flight details and switches that segment into manual-entry view.

Applying a result currently fills:

- airline and flight number
- departure and arrival airports
- departure and arrival dates
- departure and arrival times
- timezones
- terminals and gates
- aircraft details when available

## Search Flight Offers

The `Search Flight Offers` section is separate from the segment cards.

Use it when you want to price-shop a route rather than look up one exact segment.

Current behavior:

- It opens a route-level search panel.
- The first segment's departure airport, arrival airport, and departure date are used as the default search values when available.
- You can filter or sort the results before selecting one.
- Selecting an offer replaces the current flight segments with the offer segments.
- If the offer contains more than one segment, Tailfire can switch the flight activity to a multi-segment display automatically.

## Manual Entry And Search Mode

Inside each segment:

- `Add Manually` switches the segment into direct-entry mode.
- `Back to Search` returns that segment to the search-first view.

Manual entry is useful when:

- the provider search does not find the exact segment
- you are entering a charter or unusual carrier
- you need to correct a few fields after applying a result

## Practical Tips

- Put the airline or airline code in the airline field.
- In the flight-number field, enter the flight number itself rather than repeating the airline code.
- Use segment search when you know the booked flight already.
- Use `Search Flight Offers` when you are still shopping options.
- After applying search results, review the airports, dates, and times before saving.
- For multi-leg journeys, review every segment card after an offer is applied.

## Related Articles

- [Trip Components](./Agent-Guide-Trip-Components.md)
- [Build And Propose An Itinerary](./Agent-Guide-Build-And-Propose-An-Itinerary.md)
- [Record Supplier Bookings](./Agent-Guide-Record-Supplier-Bookings.md)
- [Trip Workflow](./Trip-Workflow.md)
