# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **MCPB bundle.** `manifest.json` describes the local stdio install for Claude
  Desktop, with all 35 tools and the user configuration the server reads.
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

### Changed
- **Renamed the server to `connectwise-mcp-server`** — the package name, the
  binary, the MCPB bundle identifier, and the name MCP clients display. Tool names
  are unchanged: `psa_*`, `automate_*` and `screenconnect_*` are the public API and
  they did not move.

### Security
- **The remote entry now fails closed.** With neither `MCP_AUTH_TOKEN` nor an
  Entra pair configured it previously logged a warning and served anyway. It now
  exits non-zero. This connector can create and update tickets, add notes, create
  time and expense entries, and issue raw requests to three products, so an open
  endpoint is not a degraded deployment of it.
  `MCP_ALLOW_ANONYMOUS=true` overrides the guard for a local, non-routable test
  and names the consequence in the warning it prints.

[Unreleased]: https://github.com/patrickking67/connectwise-mcp-server/commits/main
