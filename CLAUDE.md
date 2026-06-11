# connectwise-mcp

## Project overview

Unified ConnectWise MCP server exposing ConnectWise PSA (Manage) and optionally ConnectWise Automate to MCP clients. Runs as a remote streamable-HTTP server (stateless, horizontally scalable) or local stdio. Primary deploy target: Azure Container Apps via the Dockerfile; the app is host-portable.

## Tech stack

- TypeScript (strict, ESM, NodeNext), Node >= 20
- `@modelcontextprotocol/sdk` (McpServer, StreamableHTTPServerTransport stateless mode, StdioServerTransport)
- Express 5, Zod 3
- Vitest for tests

## Repo layout

- `src/index.ts` — HTTP entry: Express app, `/healthz`, `/mcp` + `/mcp/:token`, bearer/path-token auth (timing-safe), fresh server+transport per request
- `src/stdio.ts` — local stdio entry
- `src/server.ts` — `createServer(config, deps)`; server instructions document PSA condition syntax
- `src/config.ts` — env parsing; `normalizePsaSite` adds the `api-` prefix for cloud hosts
- `src/lib/psa-client.ts` — PSA REST client: Basic auth (`companyId+publicKey:privateKey`), `clientId` header, 429 retry honoring Retry-After (capped), one 5xx retry, Link-header pagination, `CwApiError`
- `src/lib/automate-client.ts` — Automate client: token via `/cwa/api/v1/apitoken`, cached, refreshed on 401
- `src/lib/screenconnect-client.ts` — Control (ScreenConnect) client, BETA: forms-auth login + cookie/antiforgery, generic passthrough; endpoint shapes are version-dependent
- `src/tools/psa.ts` — `SEARCHES` spec array drives the search tools; bespoke tools for ticket/company/time/expense/board workflows; `psa_api_request` escape hatch
- `src/tools/automate.ts` — Automate tools, registered only when configured
- `src/tools/screenconnect.ts` — Control tools (beta), registered only when `CW_SCREENCONNECT_*` is set
- `test/` — vitest; server tests run end-to-end through `InMemoryTransport` with injected `fetchImpl`

## Commands

- `npm run dev` — tsx watch on the HTTP entry
- `npm run build` — tsc to `dist/`
- `npm test` — vitest run
- `npm run typecheck` — tsc over src + test (tsconfig.test.json)

## Key conventions

- Tool results: `jsonResult()` (compact JSON, nulls stripped) and `errorResult()`; wrap handlers in `safeHandler` so API failures become tool errors, never protocol errors
- Search tools default to compact `fields` lists; `fields: "all"` returns full records — keep default field lists limited to names verified against the OpenAPI spec (`All.json` in the 2026.4 SDK download)
- Read tools carry `readOnlyHint: true`; write tools set destructive/idempotent hints explicitly
- New searchable PSA entities: add a `SEARCHES` entry, not a hand-rolled tool
- Inject `fetchImpl`/`sleep` through `ClientDeps` for testability; never hit the network in tests

## Security boundaries

- ConnectWise credentials are server-side env vars/secrets only — never log them, never return them in tool output
- `MCP_AUTH_TOKEN` gates the endpoint; comparisons are timing-safe; keep the path-token route working (claude.ai custom connectors cannot send headers)
- Entra per-user auth (`src/lib/entra-auth.ts`): validates Entra v2 JWTs via jose when `AZURE_TENANT_ID`/`AZURE_CLIENT_ID` are set; serves `/.well-known/oauth-protected-resource`; coexists with the shared token — setup in docs/ENTRA_SETUP.md
- `psa_api_request` must refuse DELETE without `confirm: true`; Automate refuses all non-GET without `confirm: true` — do not weaken these guardrails
- Do not deploy or push from this repo without being explicitly asked
