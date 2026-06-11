---
name: Ticket Triage
description: Use when triaging, prioritizing, or reviewing ConnectWise service tickets — e.g. "what tickets need attention", "triage the Help Desk board", "show me unassigned new tickets", "summarize open tickets for Acme", "what's escalated". Surfaces, ranks, and acts on service desk work.
version: 0.1.0
---

# ConnectWise Ticket Triage

Help a technician or dispatcher make sense of the service board and act on it. The goal is a ranked, skimmable picture of what needs attention and concrete next actions — not a raw dump.

## Tools

- `psa_search_tickets` — find tickets by board, status, owner, company, age
- `psa_get_ticket` — full detail + notes for one ticket
- `psa_update_ticket` — change status, owner, priority (PATCH semantics)
- `psa_add_ticket_note` — discussion / internal / resolution notes
- `psa_list_boards` / `psa_get_board_info` — valid board + status/type names before you change them

## Workflow

1. **Scope the queue.** Default to open, non-closed work. Common conditions:
   - Unassigned new: `status/name="New" and owner=null`
   - A board: `board/name="Help Desk" and closedFlag=false`
   - One client: `company/identifier="acme" and closedFlag=false`
   - Stale: `closedFlag=false and lastUpdated < [2026-06-03T00:00:00Z]`
   - Escalated/aging by SLA: sort with `orderBy: "_info/lastUpdated asc"` to see oldest-touched first.
2. **Rank, don't list.** Order by priority then age. Call out: unassigned, breaching/aging, customer-responded, and anything high severity/impact.
3. **Summarize each** in one line: `#id · company · summary · status · owner · age`. Pull `psa_get_ticket` only for the few that need detail.
4. **Recommend actions** and, when the user confirms, execute:
   - Assign: `psa_update_ticket` with `{"owner":{"identifier":"pking"}}`
   - Move status: `{"status":{"name":"In Progress"}}` (verify the name via `psa_get_board_info` first — statuses are board-specific)
   - Note: `psa_add_ticket_note` (use `internal` for analysis the customer shouldn't see)

## Guardrails

- Status/type/priority names vary per board — confirm with `psa_get_board_info` before writing, or the PATCH fails.
- Default to compact fields; only request `fields: "all"` when the user needs detail.
- Confirm before bulk status changes or reassignments. Never close tickets unless explicitly asked.
- Paginate (`page`, `pageSize`) for big queues; report counts honestly ("showing 25 of N").
