---
name: Expense Entry
description: Use when logging or reviewing expenses in ConnectWise — e.g. "expense $40 of mileage to the Acme onsite", "log my lunch receipt to ticket 1234", "what expenses did I submit this month", "add a $200 hardware expense". Creates and reviews PSA expense entries with correct billing.
version: 0.1.0
---

# ConnectWise Expense Entry

Capture reimbursable and billable expenses against the right work item with the right billing treatment.

## Tools

- `psa_create_expense` — log an expense (type, amount, date required)
- `psa_search_expenses` — review existing expenses

## Logging an expense

`psa_create_expense` fields:

- **expenseType** (required): the type name — e.g. `Mileage`, `Meals`, `Airfare`, `Hardware`. Match your instance's configured types.
- **amount** (required): the cost.
- **date** (required): ISO-8601, e.g. `2026-06-10T00:00:00Z`.
- **chargeToType** + **chargeToId**: tie it to `ServiceTicket` / `ProjectTicket` / `Activity` / `ChargeCode` work.
- **billableOption**: `Billable` | `DoNotBill` | `NoCharge` | `NoDefault` — ask if unclear; client-reimbursable vs. internal matters.
- **notes**: what the expense was for.
- **classification** / **paymentMethod** / **memberIdentifier**: set when relevant.

### Conventions

- "40 bucks of mileage on the Acme job" → type `Mileage`, amount 40, charge to that ticket, Billable if the client reimburses.
- Confirm the parsed expense (type, amount, date, charge target, billable) before creating unless told "just log it."
- Don't invent amounts or receipts — log only what the user states.

## Reviewing expenses

`psa_search_expenses` conditions:
- Mine this month: `member/identifier="pking" and date > [2026-06-01T00:00:00Z]`
- For a ticket: `chargeToId=1234 and chargeToType="ServiceTicket"`
- Billable only: `billableOption="Billable"`

Sum `amount` for totals; split billable vs. non-billable.

## Guardrails

Expenses flow to invoices and reimbursement — confirm before logging large amounts, and get the billable flag right rather than defaulting.
