# ConnectWise plugin

Run **ConnectWise PSA (Manage)**, **Automate (RMM)**, and **Control (ScreenConnect)** from your AI assistant, with workflow skills for the daily MSP grind. The plugin connects to the [connectwise-mcp](https://github.com/patrickking67/connectwise-mcp) server (a remote MCP connector you host), so your ConnectWise credentials stay server-side and never reach the client. Works with any MCP-capable client.

## What you get

**13 skills** (auto-activate when relevant):

| Skill | For |
| --- | --- |
| Ticket Triage | Ranked service board; assign, re-status, note |
| Create Ticket | Open well-formed tickets on the right board |
| Log Time | Time entries with correct billable status |
| Expense Entry | Log/review expenses against work |
| Client Overview | 360° brief: company, contacts, assets, agreements, AR |
| Asset Management | Managed configurations/devices per client |
| Project Management | Project status, phases, budget-vs-actual |
| Agreements & Billing | Contracts, billed additions, invoices, AR |
| Sales Pipeline | Opportunities and activities |
| Procurement | Purchase orders and line items |
| Dispatch & Scheduling | Calendar, tech availability |
| RMM (Automate) | Managed endpoints, online/offline, detail |
| Remote Support (ScreenConnect) | Remote-access sessions (beta) |

**Commands:** `/cw-status` (connectivity + what's enabled) · `/cw-triage [board|company]` (triage the service board)

**Tools:** 29 PSA tools (tickets, companies, contacts, configurations, time, expenses, projects, project tickets, opportunities, agreements + additions, invoices, members, activities, schedule, boards, purchase orders, ticket tasks, plus a full-API escape hatch), optional Automate (RMM) tools, and optional Control (ScreenConnect) tools — all surfaced from the MCP server.

## Install

```
/plugin marketplace add patrickking67/connectwise-mcp
/plugin install connectwise@connectwise-mcp
```

## Configure

The plugin reads two environment variables to reach your hosted MCP server:

| Variable | Value |
| --- | --- |
| `CONNECTWISE_MCP_URL` | `https://<your-host>/mcp` (the deployed endpoint) |
| `CONNECTWISE_MCP_TOKEN` | the server's `MCP_AUTH_TOKEN` |

Set them where your client reads env (your shell profile or `.claude/settings.json` `env`), then restart the client. Verify with `/cw-status`.

Which modules light up (PSA always; Automate and Control optional) is controlled **server-side** by which credentials you set there — see the [connectwise-mcp repo](https://github.com/patrickking67/connectwise-mcp).

> Don't have the server yet? `docs/SETUP.md` in that repo deploys it to Azure Container Apps in a few commands. For per-user Microsoft sign-in instead of a shared token, see `docs/ENTRA_SETUP.md`.

## Notes

- **Read vs write:** search/get tools are read-only; create/update tools and the raw-API escape hatches make changes. The skills confirm before writing and never close tickets, log large/backdated time, or touch live remote-access sessions without asking.
- **ScreenConnect is beta** — Control has no clean public API, so those tools drive its host-page services behind forms auth and may need adjusting per Control version.
- **Permissions** are governed by the ConnectWise API member's security role on the server side — scope it to what you want the assistant to do.
