import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

// Local stdio entry point for Claude Code / Claude Desktop:
//   claude mcp add connectwise -e CW_PSA_SITE=... -- node dist/stdio.js
const config = loadConfig();
const server = createServer(config);
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
