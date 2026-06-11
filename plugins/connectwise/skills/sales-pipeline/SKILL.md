---
name: Sales Pipeline
description: Use for ConnectWise sales — opportunities and activities — e.g. "what's in my pipeline", "show open opportunities closing this quarter", "what deals are stuck", "my sales activities for today", "pipeline value for Acme". Reviews and summarizes the sales funnel.
version: 0.1.0
---

# ConnectWise Sales Pipeline

Give a salesperson or manager a clear read on the funnel and the follow-ups that move it.

## Tools

- `psa_search_opportunities` — deals by stage, rep, company, close date
- `psa_search_activities` — calls, meetings, and to-dos
- `psa_search_companies` / `psa_search_contacts` — resolve accounts and people

## Pipeline

`psa_search_opportunities` conditions:
- My open pipeline: `primarySalesRep/identifier="pking" and status/name="Open"`
- Closing this quarter: `expectedCloseDate < [2026-09-30T00:00:00Z] and status/name="Open"`
- For an account: `company/identifier="acme"`
- A stage: `stage/name="Proposal"`

Summarize: count and total value by stage, deals closing soon, and stalled deals (open with an old `pipelineChangeDate` / far-past `expectedCloseDate`). Lead with what needs attention.

## Activities

`psa_search_activities` conditions:
- Mine, open: `assignTo/identifier="pking" and status/name="Open"`
- Today: filter `dateStart` within the day
- For a deal/account: `opportunity/id=<id>` or `company/identifier="acme"`

Use these for "what should I follow up on" — surface overdue and today's.

## Tips

- "What's stuck" = open opportunities with no recent stage movement; pair with the account's last activity.
- Run opportunity + activity queries in parallel for a rep's daily briefing.

## Guardrails

Read-first. Confirm before creating/updating opportunities or activities, and don't change stage or close deals unless explicitly asked.
