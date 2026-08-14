import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { PsaClient, type ClientDeps } from "./lib/psa-client.js";
import { AutomateClient } from "./lib/automate-client.js";
import { ScreenConnectClient } from "./lib/screenconnect-client.js";
import { registerPsaTools } from "./tools/psa.js";
import { registerAutomateTools } from "./tools/automate.js";
import { registerScreenConnectTools } from "./tools/screenconnect.js";

export const SERVER_NAME = "connectwise-mcp-server";
export const SERVER_VERSION = "0.2.0";

const INSTRUCTIONS = `Unified ConnectWise MCP server. psa_* tools cover ConnectWise PSA (Manage);
automate_* tools cover ConnectWise Automate (RMM) and screenconnect_* tools cover
ConnectWise Control (ScreenConnect, beta) when those modules are configured.

PSA condition syntax (the \`conditions\` parameters):
- Operators: =, !=, <, <=, >, >=, contains, like, in, not. Combine with and/or, group with ().
- Strings in double quotes: status/name="New". Wildcards with like: name like "acme%".
- Dates in square brackets, UTC ISO-8601: lastUpdated > [2026-06-01T00:00:00Z].
- Reference fields use slashes: board/name="Help Desk", status/id in (1,2,3). Booleans: closedFlag=false.
- Only fields present on the entity can be used in conditions.

Search tools return a compact field set by default; pass fields="all" for complete records or a
comma-separated list to choose. Results are paginated — check hasMore and pass page to continue.

Ticket workflow: psa_list_boards -> psa_get_board_info (valid statuses/types for that board) ->
psa_search_tickets / psa_create_ticket / psa_update_ticket. Anything without a dedicated tool is
reachable via psa_api_request (full REST surface: procurement, marketing, KB articles, setup tables...).`;

export function createServer(config: AppConfig, deps: ClientDeps = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  if (config.psa) {
    registerPsaTools(server, new PsaClient(config.psa, deps));
  }
  if (config.automate) {
    registerAutomateTools(server, new AutomateClient(config.automate, deps));
  }
  if (config.screenconnect) {
    registerScreenConnectTools(server, new ScreenConnectClient(config.screenconnect, deps));
  }
  return server;
}
