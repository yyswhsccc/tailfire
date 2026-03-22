# Agent Guide: Payment Schedules

This article explains how to create expected payment plans for booked items and how to record payments against those plans.

## What Payment Schedules Do

Payment schedules track when money is expected for an activity or package pricing record.

They are used to:

- define expected payment milestones
- track what has been paid
- show pending, partial, paid, or overdue items
- support trip-level payment reporting

## Before You Start

- The activity or package pricing should already be saved.
- The pricing record needs a total amount before Tailfire can build the schedule correctly.
- Payment schedules are separate from the booked flag itself.

## Schedule Types

Tailfire currently supports three schedule types:

- `In Full`
- `Deposit + Final Balance`
- `Set Installments`

New schedules auto-generate expected payment rows based on the type you choose. You can then adjust names, amounts, and due dates.

## How To Create A Payment Schedule

1. Open the booked or bookable activity/package with pricing.
2. Go to the payment schedule section.
3. Choose the schedule type.
4. Review the generated payment rows.
5. Update the payment names, amounts, and due dates as needed.
6. Save the schedule.

## How To Maintain A Schedule

Once the schedule exists, you can:

- edit payment names inline
- edit amounts inline
- pick or change due dates
- add extra expected payment items
- delete items that do not already have payments recorded

## How To Record A Payment

1. Click `Record` on the payment item you want to update.
2. Choose who paid.
3. Enter the transaction type, amount, payment method, reference number, date, and notes as needed.
4. Save the transaction.

The `Paid By` picker can use:

- an existing traveler already on the trip
- a searched contact
- a newly created contact

If you pick or create a contact who is not yet a trip traveler, Tailfire can add that contact to the trip as part of the workflow.

## Where To Review Payment Activity

- The component-level payment schedule section shows the detailed schedule.
- The trip payments views aggregate expected payments and recorded transactions across the trip.

## Good Habits

- Create the schedule as soon as supplier booking is recorded.
- Keep due dates realistic and client-facing.
- Record payments against the correct expected item instead of storing them only in notes.
- Use clear payment names that make sense to both advisors and operations staff.

## Related Articles

- [Record Supplier Bookings](./Agent-Guide-Record-Supplier-Bookings.md)
- [Service Fees](./Agent-Guide-Service-Fees.md)
- [Trip Components](./Agent-Guide-Trip-Components.md)
