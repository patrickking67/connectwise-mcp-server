---
name: Client Overview
description: Use when looking up or briefing on a ConnectWise company/client — e.g. "pull up Acme", "give me the rundown on this client", "what do we manage for them", "show everything for company X before my call". Assembles a 360° view: company, contacts, assets, agreements, and open work.
version: 0.1.0
---

# ConnectWise Client Overview

Assemble a fast, complete picture of one client — the brief you'd want before a call or QBR.

## Tools

- `psa_get_company` — company record by id or identifier
- `psa_search_contacts` — key people (email is in communicationItems → use childConditions)
- `psa_search_configurations` — managed assets/devices
- `psa_search_agreements` — active contracts
- `psa_get_agreement_additions` — billed line items on an agreement
- `psa_search_tickets` — open service work
- `psa_search_invoices` — billing/AR (`balance > 0` for outstanding)
- `psa_search_opportunities` — open sales

## Workflow

1. **Resolve the company.** `psa_get_company` with the identifier (e.g. `"acme"`) or id. If the user gave a fuzzy name, `psa_search_companies` with `name like "acme%"` first, then confirm which one.
2. **Fan out** (only the sections the user wants — don't over-fetch), filtering by `company/identifier="acme"`:
   - Contacts: primary/decision-makers; `inactiveFlag=false`
   - Configurations: `activeFlag=true`, grouped by type — the managed footprint
   - Agreements: `agreementStatus="Active"` — what they pay for; expand with `psa_get_agreement_additions` if they ask what's covered
   - Open tickets: `closedFlag=false` — current issues, with count and any aging
   - Outstanding invoices: `balance > 0` — AR exposure
3. **Brief, don't dump.** Lead with a 2–3 line summary (who they are, contract status, open issues, any AR/risk), then sections. Surface anything notable: lots of open tickets, expiring agreement, overdue balance.

## Tips

- Find a contact by email: `childConditions: 'communicationItems/value like "jane@acme.com"'`.
- Run the section searches in parallel — they're independent.
- Compact fields are enough for a briefing; pull detail only on request.
