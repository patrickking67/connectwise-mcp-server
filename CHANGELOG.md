# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — breaking

- **Every tool is now named `cw_*`.** `psa_*` became `cw_*`, `automate_*` became
  `cw_automate_*`, and `screenconnect_*` became `cw_control_*`. One prefix keeps
  the ConnectWise tools together in clients that aggregate several servers, and
  the wire name now maps mechanically onto the Title Case name a client displays:
  `cw_list_boards` shows as **List Boards**. Anything that called the old names —
  saved prompts, other people's skills — has to be updated.
- **The raw escape hatches are split by safety, not left to a `method` argument.**
  `cw_api_request` and `cw_automate_api_request` are GET-only and annotated
  read-only, so a host can run them without a prompt and Claude can run several at
  once. Writes moved to `cw_api_write` and `cw_automate_api_write`, which are
  annotated as destructive writes, carry
  `_meta["anthropic/requiresUserInteraction"]` so Claude Code asks a person on
  every call, and keep the `confirm: true` guards unchanged. Control keeps a
  single passthrough, because its `.ashx` services answer reads over POST.
- **Renamed the server to `connectwise-manage-mcp`** — the package name, the
  binary, the MCPB bundle identifier, the marketplace name, and the name MCP
  clients display.

### Added

- **A declared tool contract.** `src/tools/spec.ts` turns one declared kind
  (`read` or `write`) into the MCP annotations every client gates on, sends the
  display title as both `title` and `annotations.title` because clients read one
  or the other, and is the only path by which a tool can be registered. No tool
  ships unannotated — Microsoft 365 Copilot treats an unannotated tool as
  destructive, and Claude parallelizes only calls it has been told are read-only.
- **An interactive tool.** `cw_get_ticket` declares an MCP Apps (SEP-1865)
  `ui://` resource and returns `structuredContent` alongside its JSON, so hosts
  that support MCP Apps render a ticket card — status, assignment, recent notes,
  and a box that posts an internal note back through `cw_add_ticket_note` — while
  every other host gets exactly the JSON it got before. The card is declared under
  both the MCP Apps key and the ChatGPT `openai/outputTemplate` alias, and is a
  single self-contained document: no CDN, no network.
- **Generated tool documentation.** `docs/TOOLS.md`, the README tool table and the
  MCPB manifest's tool list are written from `src/tools/catalog.ts` by
  `npm run tools:sync`; `npm run tools:check` fails on drift and runs in CI.
- **MCPB bundle.** `manifest.json` describes the local stdio install for Claude
  Desktop, with every tool and the user configuration the server reads.
  `npm run mcpb:validate` and `npm run mcpb:pack` build and check it.
- **Azure Container Apps deployment.** `infra/main.bicep` (Container Apps
  environment, user-assigned managed identity, Key Vault secret references, Log
  Analytics, container registry) and a `deploy-azure.yml` workflow using OIDC
  federation with no stored credential. `docs/deploying-azure.md` is the runbook.
- **Continuous integration.** This repository had no CI. `ci.yml` runs typecheck,
  build, tests, and MCPB validation, checks that the build leaves no tracked file
  modified, and asserts that `manifest.json` lists exactly the tools the server
  registers — the drift that otherwise happens the first time someone adds a tool.
- Graceful SIGTERM/SIGINT draining on the remote entry. A severed write is worse
  than a severed read: the caller cannot tell whether the ticket was created.
- `npm run start:remote`, `npm run docker:build`.

### Security
- **The remote entry now fails closed.** With neither `MCP_AUTH_TOKEN` nor an
  Entra pair configured it previously logged a warning and served anyway. It now
  exits non-zero. This connector can create and update tickets, add notes, create
  time and expense entries, and issue raw requests to three products, so an open
  endpoint is not a degraded deployment of it.
  `MCP_ALLOW_ANONYMOUS=true` overrides the guard for a local, non-routable test
  and names the consequence in the warning it prints.

[Unreleased]: https://github.com/patrickking67/connectwise-mcp/commits/main
