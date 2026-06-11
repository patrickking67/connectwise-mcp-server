# Setup Guide — zero to working connector

This walks the whole path: ConnectWise credentials → Azure deployment → connecting Claude. Skip sections you've already done. The current production instance for this repo lives at `rg-connectwise-mcp` / `connectwise-mcp` (westus2).

## 1. Prerequisites

- Azure subscription + [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) logged in (`az login`)
- ConnectWise PSA admin access (to create an API member)
- Node 20+ and npm (only for local dev/tests)

## 2. ConnectWise PSA credentials (the "API key")

You need four values:

| Value | Where to get it |
| --- | --- |
| Company ID | The company id you type on the PSA login screen |
| Public + private key | PSA → **System → Members → API Members** tab → New. Give it a security role scoped to what AI should be able to do (don't use Admin). Open the member → **API Keys** tab → New → copy both keys (private key shows once) |
| clientId | <https://developer.connectwise.com/ClientID> → register an integration → copy the GUID. Treat it like a password |

Site host: cloud partners use `api-na.myconnectwise.net` / `api-eu...` / `api-au...` (the server auto-adds `api-` if you forget). On-premise: your own PSA hostname, HTTPS required.

## 3. Deploy to Azure Container Apps

First time on a fresh subscription, register the providers (one-time; skipping this causes `MissingSubscriptionRegistration` errors):

```bash
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
```

Then from the repo root:

```bash
az group create -n rg-connectwise-mcp -l westus2
az containerapp up -n connectwise-mcp -g rg-connectwise-mcp -l westus2 \
  --environment cae-connectwise-mcp --ingress external --target-port 8080 --source .
```

`--source .` builds the Dockerfile in the cloud (ACR Tasks) — no local Docker needed. Re-run the same command any time to ship a new build.

## 4. Configure secrets

```bash
TOKEN=$(openssl rand -hex 32)   # endpoint auth token — save it

az containerapp secret set -n connectwise-mcp -g rg-connectwise-mcp --secrets \
  mcp-auth-token="$TOKEN" \
  cw-psa-company-id='YOUR_COMPANY_ID' \
  cw-psa-public-key='YOUR_PUBLIC_KEY' \
  cw-psa-private-key='YOUR_PRIVATE_KEY' \
  cw-psa-client-id='YOUR_CLIENT_GUID'

az containerapp update -n connectwise-mcp -g rg-connectwise-mcp \
  --min-replicas 0 --max-replicas 3 \
  --set-env-vars \
    MCP_AUTH_TOKEN=secretref:mcp-auth-token \
    CW_PSA_SITE=api-na.myconnectwise.net \
    CW_PSA_COMPANY_ID=secretref:cw-psa-company-id \
    CW_PSA_PUBLIC_KEY=secretref:cw-psa-public-key \
    CW_PSA_PRIVATE_KEY=secretref:cw-psa-private-key \
    CW_PSA_CLIENT_ID=secretref:cw-psa-client-id
```

> **Important:** set all five `CW_PSA_*` vars or none. Partial PSA config fails fast on boot (by design), which crash-loops the container.

Get your URL:

```bash
az containerapp show -n connectwise-mcp -g rg-connectwise-mcp \
  --query properties.configuration.ingress.fqdn -o tsv
```

## 5. Connect Claude

| Client | How |
| --- | --- |
| claude.ai | Settings → Connectors → Add custom connector → `https://<fqdn>/mcp/<TOKEN>` |
| Claude Code | `claude mcp add --transport http connectwise https://<fqdn>/mcp --header "Authorization: Bearer <TOKEN>"` |
| Claude Desktop | Custom connector with the same Bearer header, or the `/mcp/<TOKEN>` URL |
| Local stdio | `npm run build`, then `claude mcp add connectwise -e CW_PSA_SITE=... -e CW_PSA_COMPANY_ID=... -e CW_PSA_PUBLIC_KEY=... -e CW_PSA_PRIVATE_KEY=... -e CW_PSA_CLIENT_ID=... -- node <repo>/dist/stdio.js` |

For per-user Microsoft sign-in instead of the shared token, see [ENTRA_SETUP.md](./ENTRA_SETUP.md).

## 6. Verify

1. `curl https://<fqdn>/healthz` → `{"ok":true,...}`
2. In Claude: "run psa_system_info" → returns your PSA version → credentials work.
3. "search tickets on the Help Desk board that aren't closed" → real data flows.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `MissingSubscriptionRegistration` on deploy | Run the `az provider register` commands in step 3 |
| 401 from `/mcp` | Token missing/wrong. Bearer header or `/mcp/<token>` path must match `MCP_AUTH_TOKEN` |
| 406 from `/mcp` | Client didn't send `Accept: application/json, text/event-stream` (use a real MCP client, not bare curl) |
| `tools/list` returns 0 tools | `CW_PSA_*` env vars not set on the app — step 4 |
| Container crash-loops | Partial `CW_PSA_*` config — set all five or none |
| `Security / SSL is required` from PSA | Site host missing the `api-` prefix (cloud) |
| 429s under load | ConnectWise rate limiting; the client already honors Retry-After with capped backoff |
| Tool errors mention security roles | The API member's PSA security role doesn't allow that module — adjust in PSA |

## Costs

Scale-to-zero consumption plan: ~$0 idle; the ACA free grant (180k vCPU-s + 2M requests/mo) covers typical connector traffic. The ACR Basic registry created by `containerapp up` runs ~$5/mo — the main fixed cost.
