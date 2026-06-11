---
name: Log Time
description: Use when logging or reviewing time in ConnectWise — e.g. "log 30 minutes to ticket 1234", "enter my time for today", "bill an hour to Acme for the firewall work", "how many hours did I put in this week". Creates and reviews PSA time entries with correct billing.
version: 0.1.0
---

# ConnectWise Time Entry

Get time logged accurately against the right work item with the right billable status — the things that actually affect invoicing.

## Tools

- `psa_create_time_entry` — log time against a ticket, project ticket, activity, or charge code
- `psa_search_time_entries` — review existing entries (by member, date, charge-to target)
- `psa_get_ticket` — confirm the ticket/company before logging

## Logging time

`psa_create_time_entry` needs:

- **chargeToType**: `ServiceTicket` | `ProjectTicket` | `ChargeCode` | `Activity`
- **chargeToId**: the ticket/activity id
- **timeStart** (and usually **timeEnd**): UTC ISO-8601, e.g. `2026-06-10T17:00:00Z`. Convert the user's local time; ask their timezone if unclear.
- **notes**: what was done (customer-visible per billing setup) — write a clean, professional summary
- **billableOption**: `Billable` | `DoNotBill` | `NoCharge` | `NoDefault` — ask if ambiguous; agreement work is often `DoNotBill`/covered
- **memberIdentifier**: defaults to the API member; set it to log for someone else

### Conventions

- Durations → time window: "30 min starting 1pm ET" → `timeStart` 1pm, `timeEnd` 1:30pm in UTC.
- Turn terse input into a real work note: "rebooted DC" → "Rebooted primary domain controller to clear a stuck replication queue; verified AD replication healthy afterward."
- One entry per distinct task; split if the user describes multiple.
- Confirm the parsed entry (target, window, billable, note) before creating unless the user said "just log it."

## Reviewing time

`psa_search_time_entries` conditions:

- Mine this week: `member/identifier="pking" and timeStart > [2026-06-08T00:00:00Z]`
- For a ticket: `chargeToId=1234 and chargeToType="ServiceTicket"`
- Sum `actualHours` across results for totals; note billable vs non-billable split.

## Guardrails

- Don't invent time — only log what the user states or confirms.
- Get billable status right; when unsure, ask rather than defaulting to Billable.
- Time entries affect invoices — confirm before logging large or backdated blocks.
