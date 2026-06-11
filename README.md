# connectwise-mcp

Unified ConnectWise MCP server — use ConnectWise **PSA (Manage)** and **Automate** from Claude and any other MCP client, locally or as a **remote MCP connector** (claude.ai custom connector, Claude Code, Claude Desktop, API).

- **PSA (Manage):** 23 tools — ticket search/create/update/notes, companies, contacts, configurations (assets), time entries, projects, opportunities, agreements, invoices, members, activities, schedule, boards, plus a `psa_api_request` escape hatch covering the full 1,800+ endpoint REST surface.
- **Automate (RMM):** optional module (enabled by env vars) — computers, clients, and a guarded raw API tool.
- **ScreenConnect:** on the roadmap (its API is instance/extension-specific; see below).

Transport is **stateless streamable HTTP**, so any number of replicas can serve traffic — built to run on Azure Container Apps (scale-to-zero) but portable to any container host. A stdio entry point is included for local use.

**Guides:** [docs/GO-LIVE.md](docs/GO-LIVE.md) — remaining steps to flip it on · [docs/SETUP.md](docs/SETUP.md) — zero-to-working walkthrough (credentials, deploy, connect, troubleshoot) · [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md) — per-user Microsoft Entra sign-in instead of the shared token.

## Prerequisites

1. **PSA API Member keys** (recommended over personal keys): PSA → System → Members → API Members → create member with an appropriate security role → API Keys tab → generate public/private key pair.
2. **Developer clientId**: register at <https://developer.connectwise.com/ClientID>. Required header on every PSA call. Treat it like a secret.
3. Your PSA site host. Cloud regions must use the `api-` prefix (`api-na.myconnectwise.net`, `api-eu...`, `api-au...`); the server auto-corrects the bare host. On-premise: your own hostname (HTTPS required).

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `CW_PSA_SITE` | yes | e.g. `api-na.myconnectwise.net` |
| `CW_PSA_COMPANY_ID` | yes | your PSA login company id |
| `CW_PSA_PUBLIC_KEY` / `CW_PSA_PRIVATE_KEY` | yes | API member keys |
| `CW_PSA_CLIENT_ID` | yes | developer clientId GUID |
| `CW_PSA_VERSION` | no | pin API model version, e.g. `2026.4` |
| `MCP_AUTH_TOKEN` | strongly recommended | protects the `/mcp` endpoint; `openssl rand -hex 32` |
| `CW_AUTOMATE_URL` / `CW_AUTOMATE_USERNAME` / `CW_AUTOMATE_PASSWORD` / `CW_AUTOMATE_CLIENT_ID` | no | set all four to enable Automate tools |
| `PORT` | no | default 8080 |

## Run locally

```bash
npm install
npm run dev          # http://localhost:8080/mcp
npm test             # unit + integration tests
```

Quick check: `curl localhost:8080/healthz`, then point the MCP inspector at it:

```bash
npx @modelcontextprotocol/inspector
# Streamable HTTP -> http://localhost:8080/mcp  (Authorization: Bearer <MCP_AUTH_TOKEN>)
```

## Deploy to Azure Container Apps

```bash
RG=rg-connectwise-mcp
APP=connectwise-mcp
LOC=eastus
TOKEN=$(openssl rand -hex 32)

az group create -n $RG -l $LOC

# Build from source (ACR task) and create the app + environment in one shot
az containerapp up -n $APP -g $RG -l $LOC --ingress external --target-port 8080 --source .

# Secrets + env, scale to zero when idle
az containerapp secret set -n $APP -g $RG --secrets \
  cw-psa-company-id='YOUR_COMPANY_ID' \
  cw-psa-public-key='YOUR_PUBLIC_KEY' \
  cw-psa-private-key='YOUR_PRIVATE_KEY' \
  cw-psa-client-id='YOUR_CLIENT_GUID' \
  mcp-auth-token="$TOKEN"

az containerapp update -n $APP -g $RG \
  --min-replicas 0 --max-replicas 3 \
  --set-env-vars \
    CW_PSA_SITE=api-na.myconnectwise.net \
    CW_PSA_COMPANY_ID=secretref:cw-psa-company-id \
    CW_PSA_PUBLIC_KEY=secretref:cw-psa-public-key \
    CW_PSA_PRIVATE_KEY=secretref:cw-psa-private-key \
    CW_PSA_CLIENT_ID=secretref:cw-psa-client-id \
    MCP_AUTH_TOKEN=secretref:mcp-auth-token

az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv
echo "MCP URL: https://<fqdn>/mcp   token: $TOKEN"
```

Any other container host (Railway, Fly.io, Cloud Run, a VPS) works the same way: build the Dockerfile, set the env vars, expose port 8080.

## Connect AI clients

| Client | How |
| --- | --- |
| **claude.ai custom connector** | Settings → Connectors → Add custom connector → URL `https://<host>/mcp/<MCP_AUTH_TOKEN>` (path token, since custom connectors can't send headers) |
| **Claude Code** | `claude mcp add --transport http connectwise https://<host>/mcp --header "Authorization: Bearer <MCP_AUTH_TOKEN>"` |
| **Claude Desktop / others** | Streamable HTTP URL + `Authorization: Bearer <token>` header |
| **Local stdio** | `npm run build` then `claude mcp add connectwise -e CW_PSA_SITE=... -e CW_PSA_COMPANY_ID=... -e CW_PSA_PUBLIC_KEY=... -e CW_PSA_PRIVATE_KEY=... -e CW_PSA_CLIENT_ID=... -- node <repo>/dist/stdio.js` |

## Security notes

- ConnectWise credentials live **server-side only**; MCP clients never see them. Scope the API member's security role to what you actually want AI to do (the PSA security role matrix applies to API calls).
- The endpoint token can be sent as a Bearer header or embedded in the URL path (capability URL) for clients that can't send headers. Rotate it by updating the secret.
- **Per-user auth:** set `AZURE_TENANT_ID` + `AZURE_CLIENT_ID` and the server validates Microsoft Entra bearer JWTs (signature/issuer/audience/expiry) and serves RFC 9728 OAuth discovery metadata — see [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md). Works alongside or instead of the shared token.
- Destructive guardrails: `psa_api_request` refuses `DELETE` without `confirm: true`; all non-GET Automate requests require `confirm: true`.

## Claude plugin + marketplace

This repo also ships a **Claude Code plugin** that wraps the hosted server with auto-activating MSP workflow skills (ticket triage, time entry, client overview, ticket creation) and `/cw-status` + `/cw-triage` commands. The repo root is a marketplace, so installing is two lines:

```
/plugin marketplace add patrickking67/connectwise-mcp
/plugin install connectwise@connectwise-mcp
```

Then set `CONNECTWISE_MCP_URL` (your `/mcp` endpoint) and `CONNECTWISE_MCP_TOKEN`. Details in [plugins/connectwise/README.md](plugins/connectwise/README.md).

## Roadmap

- **ScreenConnect (Control) module** — needs instance-specific extension/API details; the architecture has a slot for a third client + tool module.
- Callback (webhook) receiver for PSA ticket events.

## Layout

```
src/
  index.ts            HTTP entry (Express, stateless streamable HTTP, bearer/path-token auth)
  stdio.ts            local stdio entry
  server.ts           McpServer assembly + instructions
  config.ts           env parsing, PSA site normalization
  lib/psa-client.ts   PSA REST client (auth, 429 retry w/ Retry-After, Link-header pagination)
  lib/automate-client.ts  Automate REST client (token cache + refresh)
  tools/psa.ts        12 spec-driven search tools + 11 workflow tools
  tools/automate.ts   Automate tools (conditional)
test/                 vitest suites (client, config, end-to-end via InMemoryTransport)
```
