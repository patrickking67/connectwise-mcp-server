---
name: Dispatch & Scheduling
description: Use for the ConnectWise dispatch calendar and technician scheduling — e.g. "what's on my schedule today", "who's free this afternoon", "what's dispatched to the Acme onsite", "show the team's calendar tomorrow". Reviews schedule entries and tech availability.
version: 0.1.0
---

# ConnectWise Dispatch & Scheduling

Help dispatch and techs see who's doing what, when — and what still needs coverage.

## Tools

- `psa_search_schedule_entries` — calendar entries (who, when, what object)
- `psa_search_members` — technicians
- `psa_search_tickets` — the work behind a scheduled entry

## Workflow

1. **Scope the calendar.** `psa_search_schedule_entries`:
   - A tech's day: `member/identifier="pking" and dateStart > [2026-06-10T00:00:00Z] and dateStart < [2026-06-11T00:00:00Z]`
   - Open/not-done: `doneFlag=false`
   - A team window: drop the member filter, keep the date range.
2. **Present a timeline** ordered by `dateStart`: `time · member · what (name) · #objectId`. `objectId` is the scheduled ticket/activity — pull it with `psa_get_ticket` if the user wants detail.
3. **Coverage / availability.** Cross-reference scheduled members against `psa_search_members` (`inactiveFlag=false`) to spot who's unbooked in a window. Flag conflicts (overlapping entries for one member).

## Tips

- "What's on my schedule today" → that member, today's date range, ordered by start.
- "Who's free this afternoon" → members with no schedule entry overlapping the window.
- Schedule entries reference the ticket via `objectId` — that's the link back to the work.

## Guardrails

Read-first. Confirm before creating/moving schedule entries or reassigning techs — dispatch changes affect people's day.
