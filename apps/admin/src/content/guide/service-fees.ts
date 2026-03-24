export const content = `
## Service Fees

Service fees are agency charges separate from supplier bookings. Use them for planning fees, research fees, consulting charges, or any other non-supplier service you bill to the client.

## Creating a Service Fee

1. Open the trip and go to the **Service Fees** tab.
2. Click **Add Fee**.
3. Enter the **Fee Title** — be specific so clients know what they are paying for.
4. Enter the **Amount**.
5. Add an optional **Description** with details about the service provided.
6. Click **Save**.

New fees start in **Draft** status.

## Fee Status Flow

| Status | Meaning |
|--------|---------|
| **Draft** | Fee created but not yet sent to the client |
| **Sent** | Fee has been communicated to the client |
| **Paid** | Client has paid the fee |
| **Partially Refunded** | A partial refund has been processed |
| **Refunded** | The full fee has been refunded |
| **Cancelled** | The fee has been cancelled |

## Managing Fees

From the fee actions menu you can:

- **Mark as Sent** — move a draft fee to sent status
- **Mark as Paid** — record that payment has been received
- **Process Refund** — issue a partial or full refund on a paid fee
- **Cancel** — cancel a draft or sent fee
- **Open Stripe Invoice** — view the hosted invoice (if Stripe is configured)

> **Tip:** If your agency uses Stripe, you can generate a hosted invoice directly from a draft fee. Confirm the invoice was created before directing the client to pay.

## Service Fees vs. Supplier Payments

Service fees and supplier payment schedules serve different purposes:

- **Service fees** — money the client pays to your agency for your services
- **Payment schedules** — money owed to suppliers for booked activities

Do not use service fees to track supplier payments, and do not use payment schedules for agency charges.

> **Tip:** Keep fee titles descriptive. "Planning Fee - Italy Trip" is much clearer than "Fee" when the client receives an invoice.
`
