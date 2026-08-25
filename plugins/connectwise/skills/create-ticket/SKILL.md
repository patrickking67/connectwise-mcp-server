---
name: Create Ticket
description: Use when opening a new ConnectWise service ticket — e.g. "open a ticket for Acme", "log a new issue: printer down at the front desk", "create a ticket and assign it to me". Resolves company, board, status, priority, and contact, then creates a well-formed ticket.
version: 0.1.0
---

# Create a ConnectWise Service Ticket

Turn a request into a properly-formed ticket on the right board — not a bare summary that dispatch has to clean up.

## Tools

- `cw_create_ticket` — create it (only `summary` + `company` are strictly required)
- `cw_list_boards` — find valid board names
- `cw_get_board_info` — valid statuses / types / subtypes for a board
- `cw_get_company` / `cw_search_contacts` — resolve company and contact

## Workflow

1. **Company** (required). Use the identifier (e.g. `"acme"`) or confirm via `cw_get_company`. If fuzzy, `cw_search_companies` and confirm.
2. **Board.** If not given, ask or default sensibly (e.g. "Help Desk"). `cw_list_boards` lists valid names — board drives which statuses/types are legal.
3. **Status / type / priority.** These are board-specific — pull `cw_get_board_info` before setting them, or omit and let ConnectWise default. Never guess a status name.
4. **Contact** (recommended). `cw_search_contacts` filtered to the company; match by name/email.
5. **Write it well.** A crisp `summary` (≤100 chars) and an `initialDescription` with the real detail (symptoms, affected user/device, when it started, impact). Set `severity`/`impact` if the user signals urgency.
6. **Confirm, then create.** Echo the parsed ticket (company, board, status, priority, contact, summary) and create on confirmation. Return the new ticket id/number.

## Example

> "Printer down at Acme front desk, urgent"

Resolve `company="acme"`, board "Help Desk", priority via `cw_get_board_info`, then:

```
cw_create_ticket {
  summary: "Front desk printer offline",
  companyIdentifier: "acme",
  board: "Help Desk",
  priority: "Priority 2 - High",
  initialDescription: "Front-desk shared printer is offline and unreachable...",
  severity: "High", impact: "Medium"
}
```

## Guardrails

- Don't fabricate board/status/priority names — verify with `cw_get_board_info`.
- Keep `summary` ≤ 100 chars; put detail in `initialDescription`.
- Confirm before creating unless the user said "just open it."
