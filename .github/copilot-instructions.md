# GitHub Copilot repository instructions

Before changing code:

- Read and follow the root `AGENTS.md`.
- Treat `AGENTS.md` as canonical for architecture, commands, standards, and validation.

Critical non-negotiables (repeated here because they must be direct):

- Never call `server.registerTool` directly. `registerSpecTool` is the only
  registration path — it guarantees a title, annotations, and `_meta`.
- Every tool declares a `kind` (`read` / `write` / `interactive`). Hosts gate on
  these annotations; an unannotated tool is treated as destructive.
- Do not weaken the security guardrails: fail-closed startup, timing-safe token
  comparison, GET-only read escape hatches, and the `confirm: true` requirements.
- ConnectWise credentials are server-side secrets. Never log them or return them
  in tool output.
- Commits use only the repository owner's git identity. Never add an AI or bot as
  author, co-author, trailer, or reviewer.

Before completion:

- Run `npm test`, `npm run typecheck`, and `npm run tools:check`.
- Run `npm run tools:sync` after touching any tool and commit the regenerated docs.
