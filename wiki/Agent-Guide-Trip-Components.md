# Agent Guide: Trip Components

This page explains the trip components agents use while building itineraries.

## Where To Find Them

Inside the trip itinerary builder, the right-hand builder area includes a `Build your trip` sidebar with:

- `Library Items`
- `Trip Components`

`Trip Components` are the direct building blocks you add to an itinerary.

## Current Component Types

The current sidebar metadata includes:

- `Flight`
- `Lodging`
- `Transportation`
- `Tour`
- `Options`
- `Custom Cruise`
- `Port Info`
- `Dining`
- `Package`
- `Custom Tour`
- `Tour Day`
- `Insurance`

## How To Use Trip Components

1. Open the trip and go to the itinerary builder.
2. Drag the component you want into the itinerary.
3. Fill in the details for that component type.
4. Add supplier, pricing, notes, media, and documents where that component supports them.
5. Save the component before trying to attach later workflows such as booking capture or template saving.

## How To Think About The Main Types

### Bookable Components

These usually support supplier and pricing workflows:

- flight
- lodging
- transportation
- tour
- options
- custom cruise
- dining
- package
- custom tour
- insurance

### Flight Activities

Flights now support both segment-level search and route-level offer shopping:

- use the segment `Search` action when you already know the specific flight leg
- use `More Results (Amadeus)` when you want extra provider results for that segment
- use `Search Flight Offers` when you want route-based price shopping that can replace the segment list
- switch to manual mode when you need to edit or enter the leg details directly

### Informational Components

- `Port Info` is primarily informational and should not be treated like a supplier booking.
- `Tour Day` is generally part of a broader tour structure rather than a standalone supplier booking item.
- Informational components do not represent proof that a trip should move forward in lifecycle stages.

### Packages

Packages are especially important:

- a package groups related child activities
- package children should be managed as part of the package workflow
- the package acts as the booking authority for its children
- package children should not be marked booked independently through the normal workflow

## Library Items Vs Trip Components

The builder also shows `Library Items` such as:

- Package Library
- Activity Library
- Cruise Library
- Tour Library

Use library items when you want to start from reusable or reference content. Use trip components when you need to create a new itinerary item directly.

## Practical Tips

- Use the most specific component type you can. It makes pricing, booking, and reporting cleaner later.
- Use packages for bundled or multi-part experiences that should be managed together.
- Do not treat informational rows as proof of supplier fulfillment.

## Related Articles

- [Libraries](./Agent-Guide-Libraries.md)
- [Flight Activities](./Agent-Guide-Flight-Activities.md)
- [Template System](./Agent-Guide-Template-System.md)
- [Trip Workflow](./Trip-Workflow.md)
