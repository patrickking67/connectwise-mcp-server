# ConnectWise plugin for Claude

Run **ConnectWise PSA (Manage)** and **Automate** from Claude, with workflow skills for the daily MSP grind. The plugin connects to the [connectwise-mcp](https://github.com/patrickking67/connectwise-mcp) server (a remote MCP connector you host), so your ConnectWise credentials stay server-side and never reach the client.

## What you get

**Skills** (auto-activate when relevant):
- **Ticket Triage** — ranked view of the service board; assign, re-status, note
- **Log Time** — log/review time entries with correct billable status
- **Client Overview** — 360° client brief: company, contacts, assets, agreements, open work, AR
- **Create Ticket** — open well-formed tickets on the right board

**Commands:**
- `/cw-status` — connectivity + what's enabled
- `/cw-triage [board|company]` — triage the service board

**Tools:** 27 PSA tools (tickets, companies, contacts, configurations, time, projects, opportunities, agreements, invoices, members, activities, schedule, boards, purchase orders, agreement additions, ticket tasks, a full-API escape hatch) plus optional Automate tools — all surfaced from the MCP server.

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

Set them where Claude Code reads env (your shell profile or `.claude/settings.json` `env`), then restart Claude Code. Verify with `/cw-status`.

> Don't have the server yet? See the [connectwise-mcp repo](https://github.com/patrickking67/connectwise-mcp) — `docs/SETUP.md` deploys it to Azure Container Apps in a few commands. For per-user Microsoft sign-in instead of a shared token, see `docs/ENTRA_SETUP.md` (point `CONNECTWISE_MCP_URL` at `/mcp` and let the client do the OAuth flow).

## Notes

- **Read vs write:** search/get tools are read-only; create/update tools and the raw-API escape hatch make changes. The skills confirm before writing and never close tickets or log large/backdated time without asking.
- **Permissions** are governed by the ConnectWise API member's security role on the server side — scope it to what you want AI to do.
