---
name: Agreements & Billing
description: Use for ConnectWise agreements, contracts, and invoicing — e.g. "what's Acme's agreement cover", "which agreements expire this quarter", "show unpaid invoices", "what are we billing this client monthly", "outstanding AR for Acme". Reviews managed-service contracts, their billed additions, and invoices.
version: 0.1.0
---

# ConnectWise Agreements & Billing

Answer "what do they pay for" and "what do they owe" — contract coverage and receivables.

## Tools

- `psa_search_agreements` — managed-service contracts
- `psa_get_agreement_additions` — the billed line items on an agreement (seats, licenses, products)
- `psa_search_invoices` — invoices and balances
- `psa_search_companies` — resolve the client

## Agreements

`psa_search_agreements` conditions:
- A client's active contracts: `company/identifier="acme" and agreementStatus="Active"`
- Expiring: `endDate < [2026-09-30T00:00:00Z] and agreementStatus="Active"`
- By type: `type/name contains "Managed"`

For "what's covered," call `psa_get_agreement_additions` on the agreement id — each addition is a billed item with quantity and unit price. Summarize monthly recurring (sum of `quantity × unitPrice` for non-cancelled additions) and flag anything cancelled or with `lessIncluded`.

## Invoices & AR

`psa_search_invoices` conditions:
- Outstanding: `balance > 0` (add `company/identifier="acme"` to scope)
- Recent: `date > [2026-01-01T00:00:00Z]`

Report total billed (`total`) vs. outstanding (`balance`); list overdue (past `dueDate`) first. Sum balances for AR exposure.

## Tips

- "What are we billing monthly" → active agreements + their additions, rolled up.
- "Expiring this quarter" → agreements with `endDate` in the window — renewal opportunities.
- Run agreement and invoice queries in parallel for a billing snapshot.

## Guardrails

Financial data — be precise, compute totals from the actual numbers (don't estimate), and read-only unless explicitly asked to change something.
