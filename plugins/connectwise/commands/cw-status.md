---
name: cw-status
description: Check ConnectWise MCP connectivity and show what's enabled
allowed-tools: ["mcp__plugin_connectwise_connectwise__psa_system_info"]
---

Verify the ConnectWise connection and report status.

1. Call `psa_system_info`.
2. If it succeeds, report: connected ✓, the PSA version, and whether it's cloud or on-premise.
3. If it fails:
   - 401 → the `CONNECTWISE_MCP_TOKEN` is missing or wrong (check the env var the plugin reads).
   - tools missing / "no tools" → the server's `CW_PSA_*` credentials aren't set yet.
   - connection error → check `CONNECTWISE_MCP_URL` points at the deployed `/mcp` endpoint.

Keep it to a couple lines. This is a quick health check before doing real work.
