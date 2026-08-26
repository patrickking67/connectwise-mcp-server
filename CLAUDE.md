@AGENTS.md

# Claude Code-specific instructions

- Treat root and applicable nested `AGENTS.md` files as canonical.
- Do not create or rely on local or user-level configuration.
- Use only remote HTTPS MCP servers from the project `.mcp.json`.
- Never place secrets in repository files; ConnectWise credentials are
  server-side environment variables only.
- After durable changes, update `AGENTS.md` rather than this file.
