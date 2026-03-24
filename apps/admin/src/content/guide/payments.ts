export const content = `
## Payment Schedules

Payment schedules track when money is expected for a booked activity or package, and record actual transactions against those expected payments.

## Schedule Types

When creating a payment schedule, choose the structure that matches the supplier's terms:

| Type | Description |
|------|-------------|
| **In Full** | One payment for the entire amount |
| **Deposit + Final Balance** | An upfront deposit followed by a final payment |
| **Set Installments** | Multiple payments split across custom dates |

## Creating a Payment Schedule

1. Open the activity or package and go to the **Booking / Pricing** tab.
2. Scroll to the **Payment Schedule** section.
3. Select the schedule type.
4. Tailfire generates expected payment items based on your choice.
5. Adjust the **names**, **amounts**, and **due dates** for each item.
6. Click **Save**.

> **Tip:** Create the payment schedule as soon as you record a booking. This keeps due dates visible in your calendar and payment reports.

## Non-Refundable Amounts

Some schedules include a non-refundable amount. This is included within the deposit — not added on top.

For example, if the deposit is $500 and the non-refundable amount is $200, the display reads: "Deposit: $500 (includes $200 non-refundable)."

## Managing Expected Payments

After the schedule is saved, you can:

- Edit payment names, amounts, and due dates inline
- Add additional expected payment items
- Delete items that have no transactions recorded against them

## Recording a Transaction

1. Click **Record** on the expected payment item.
2. Select **Paid By** — choose an existing traveler, search for a contact, or create a new one.
3. Enter the **Transaction Type** (payment, refund, etc.).
4. Enter the **Amount**, **Payment Method**, **Reference Number**, and **Date**.
5. Add optional **Notes**.
6. Click **Save**.

> **Tip:** If you select a contact who is not yet a traveler on the trip, Tailfire can add them automatically.

## Payment Status

Each expected payment item shows its status:

- **Pending** — no transactions recorded yet
- **Partial** — some amount paid, balance remaining
- **Paid** — full amount received
- **Overdue** — past the due date with a remaining balance

## Reviewing Payments

- **Activity level** — the payment schedule section shows detailed per-item status
- **Trip level** — the **Payments** tab aggregates all expected payments and transactions across the entire trip
`
