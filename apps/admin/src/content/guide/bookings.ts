export const content = `
## Booking Activities

Booking in Tailfire means recording that a supplier has confirmed the reservation. Client approval of a proposal is a separate step — it does not mean the supplier booking has happened.

## When to Mark as Booked

Mark an activity as booked after you have confirmed the reservation directly with the supplier (by phone, email, or the supplier's own system). Tailfire is your system of record.

## Booking a Standalone Activity

1. Open the activity and go to the **Booking / Pricing** tab.
2. Click **Mark as Booked** in the form header.
3. Tailfire runs validation checks before allowing the booking. Fix any issues flagged.
4. Enter the **Confirmation Number** from the supplier.
5. Set the **Booking Date**.
6. Click **Save**.

## Booking a Package

Packages are the booking authority for their child activities.

1. Open the package activity.
2. Click **Mark as Booked**.
3. Enter the **Supplier Confirmation Number**.
4. Confirm the **Booking Date**.
5. Save the package booking.

All child activities within the package inherit the booking status. Do not book them individually.

## Validation Checks

Before an activity can be marked as booked, Tailfire verifies:

- **Supplier** is assigned
- **Dates** are set (start and end)
- **Travelers** are assigned to the activity
- **Pricing** is entered with a total amount
- **Payment Schedule** exists
- **Confirmation Number** is provided
- **Passport information** is on file for travelers (agent checkbox override available)

If any check fails, you will see a message explaining what needs to be completed first.

> **Tip:** Set up pricing and a payment schedule before attempting to book. This avoids back-and-forth when the validation checks run.

## What Happens After Booking

- The activity status changes to **Booked**
- If this is the first booking on the trip, the trip automatically moves from **Planning** to **Active**
- The booking appears in trip-level payment and commission tracking

## The Booking Tab

The **Booking / Pricing** tab on each activity shows:

- Current booking status
- Supplier and confirmation details
- Pricing breakdown
- Payment schedule summary
- An inline **Book** button for quick access

> **Warning:** Do not confuse client approval with supplier booking. A client approving a proposal does not mean the supplier has been contacted.
`
