---
name: cw-triage
description: Triage the ConnectWise service board — ranked view of what needs attention
argument-hint: "[board name or company identifier, optional]"
allowed-tools: [
  "mcp__plugin_connectwise_connectwise__psa_search_tickets",
  "mcp__plugin_connectwise_connectwise__psa_get_ticket",
  "mcp__plugin_connectwise_connectwise__psa_list_boards"
]
---

Triage open ConnectWise service tickets and present a ranked, actionable view.

Scope from `$ARGUMENTS` if provided (a board name like "Help Desk" or a company identifier like "acme"); otherwise triage all open service tickets.

1. Search open, non-closed tickets for the scope (`closedFlag=false`), ordered oldest-touched first.
2. Rank by priority then age. Flag: unassigned (`owner=null`), aging/stale, customer-responded, high severity/impact.
3. Present a compact table — `#id · company · summary · status · owner · age` — grouped by urgency, with a one-line "what needs attention first" at top.
4. Offer concrete next actions (assign, change status, add note) but don't execute changes without confirmation.

Refer to the Ticket Triage skill for condition syntax and guardrails.
