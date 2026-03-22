# Agent Guide: Service Fees

This article explains how to use trip-level service fees for agency charges that sit outside supplier booking payments.

## What Service Fees Are For

Service fees are separate from supplier bookings and separate from activity payment schedules.

Use them for agency-owned charges such as:

- planning fees
- research fees
- consulting fees
- other non-supplier service charges

## How To Create A Service Fee

1. Open the trip and go to the service fee panel.
2. Click `Add Fee`.
3. Enter the fee title.
4. Enter the amount.
5. Add an optional description.
6. Save the fee.

New service fees start in `Draft`.

## Service Fee Status Flow

The current panel supports these operational states:

- `Draft`
- `Sent`
- `Paid`
- `Partially Refunded`
- `Refunded`
- `Cancelled`

## Common Actions

From the fee actions menu, agents can currently:

- mark a draft fee as sent
- mark a sent fee as paid
- process a refund on an eligible paid fee
- cancel a draft or sent fee
- open the hosted Stripe invoice when one exists

Some environments may also expose a `Create Stripe Invoice` action for draft fees.

## Good Habits

- Keep service fee titles specific so clients and staff know what the charge is for.
- Use service fees for agency charges, not supplier remittance tracking.
- Review fee status after refunds so trip totals stay accurate.
- If your team uses Stripe invoices, confirm the hosted invoice was created before sending clients off-platform to pay.

## Related Articles

- [Payment Schedules](./Agent-Guide-Payment-Schedules.md)
- [Record Supplier Bookings](./Agent-Guide-Record-Supplier-Bookings.md)
- [Email System](./Agent-Guide-Email-System.md)
