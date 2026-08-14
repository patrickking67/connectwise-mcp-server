# connectwise-mcp-server

Unified ConnectWise MCP server — use ConnectWise **PSA (Manage)** and **Automate** from Claude and any other MCP client, locally or as a **remote MCP connector** (claude.ai custom connector, Claude Code, Claude Desktop, API).

- **PSA (Manage):** 29 tools — ticket search/create/update/notes/tasks, companies, contacts, configurations (assets), time entries, expenses, projects, project tickets, opportunities, agreements + additions, invoices, members, activities, schedule, boards, purchase orders, plus a `psa_api_request` escape hatch covering the full 1,800+ endpoint REST surface.
- **Automate (RMM):** optional module (enabled by env vars) — computers, clients, and a guarded raw API tool.
- **Control (ScreenConnect):** optional **beta** module (enabled by env vars) — remote-access session listing and an authenticated passthrough; forms-auth, instance/version-dependent.

It ships in two forms that serve the same 35 tools:

| | **Local** | **Remote** |
|---|---|---|
| Transport | stdio | Streamable HTTP (stateless) |
| Entry point | `dist/stdio.js` | `dist/index.js` |
| Runs | On your machine, beside the client | Azure Container Apps |
| Holds the ConnectWise credentials | Your machine | Key Vault |
| Authenticates callers | The OS user account | Shared token or Microsoft Entra ID |
| Installed as | An MCPB bundle (`npm run mcpb:pack`) | A URL in your client |
| Reaches | Claude Code, Desktop, on-device Cowork | …and remote Cowork, claude.ai, Microsoft Foundry |

Stateless HTTP means any number of replicas can serve traffic. Azure Container Apps is the deploy target described in [docs/deploying-azure.md](docs/deploying-azure.md), and the image is portable to any container host.

> **This connector writes.** It can create and update tickets, add notes, and create time and expense entries, and it carries raw request escape hatches for all three products. The remote entry therefore **refuses to start** unless `MCP_AUTH_TOKEN` or the Entra pair is configured — an open endpoint is not a degraded deployment of it. `MCP_ALLOW_ANONYMOUS=true` overrides the guard for a local, non-routable test and says so loudly on every start.

**Guides:** [docs/deploying-azure.md](docs/deploying-azure.md) — the Azure runbook (Bicep, Key Vault, OIDC deploys) · [docs/GO-LIVE.md](docs/GO-LIVE.md) — remaining steps to flip it on · [docs/SETUP.md](docs/SETUP.md) — zero-to-working walkthrough (credentials, deploy, connect, troubleshoot) · [docs/ENTRA_SETUP.md](docs/ENTRA_SETUP.md) — per-user Microsoft Entra sign-in instead of the shared token.

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

## Install locally (MCPB bundle)

```bash
npm ci
npm run mcpb:pack     # produces connectwise-mcp-server.mcpb
```

Install it through **Settings → Extensions → Advanced settings** in Claude for macOS or Windows. The installer prompts for the PSA credentials, and for the Automate ones if you want that module.

For Claude Code, point at the stdio entry directly:

```bash
claude mcp add connectwise -- node /absolute/path/to/connectwise-mcp/dist/stdio.js
```

## Deploy to Azure Container Apps

The quick path below creates an app from source and is fine for a first look. For a repeatable deployment — Bicep, Key Vault-backed secrets, a managed identity, and an OIDC-federated deploy workflow — use [`infra/main.bicep`](infra/main.bicep) and follow [docs/deploying-azure.md](docs/deploying-azure.md).

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

This repo also ships a **Claude Code plugin** that wraps the hosted server with 13 auto-activating MSP workflow skills (ticket triage, ticket creation, time, expenses, client overview, asset management, projects, agreements & billing, sales pipeline, procurement, dispatch, RMM, remote support) and `/cw-status` + `/cw-triage` commands. The repo root is a marketplace, so installing is two lines:

```
/plugin marketplace add patrickking67/connectwise-mcp
/plugin install connectwise@connectwise-mcp
```

Then set `CONNECTWISE_MCP_URL` (your `/mcp` endpoint) and `CONNECTWISE_MCP_TOKEN`. Details in [plugins/connectwise/README.md](plugins/connectwise/README.md).

## Roadmap

- **Port the rest of the fleet's repository baseline.** The other AmplifyAI connectors carry `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, a governance policy, and a `check-repo-contract.mjs` invariant checker wired into CI. This repository has CI, a changelog and `CLAUDE.md`, but not the rest.
- **Harden the Control (ScreenConnect) module** — it ships as beta (forms-auth, version-dependent); validate against live instances and add session actions.
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
test/                 vitest suites (client, config, startup guards, end-to-end via InMemoryTransport)
infra/main.bicep      Azure Container Apps topology
manifest.json         MCPB bundle manifest for the local install
Dockerfile            image for the remote transport
```
