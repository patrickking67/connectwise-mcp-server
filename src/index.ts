import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const config = loadConfig();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

function tokenMatches(provided: string, expected: string): boolean {
  // Hash both sides so timingSafeEqual gets equal-length buffers.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const requireAuth: express.RequestHandler = (req, res, next) => {
  if (!config.authToken) return next();
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const pathToken = typeof req.params.token === "string" ? req.params.token : undefined;
  const provided = bearer ?? pathToken;
  if (provided && tokenMatches(provided, config.authToken)) return next();
  res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "Unauthorized" });
};

// Stateless streamable HTTP: a fresh server+transport per request, no session
// affinity, so any number of replicas can serve any request.
const handleMcp: express.RequestHandler = async (req, res) => {
  const server = createServer(config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
};

const methodNotAllowed: express.RequestHandler = (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: this server runs in stateless mode" },
    id: null,
  });
};

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION });
});

app.post(["/mcp", "/mcp/:token"], requireAuth, handleMcp);
app.all(["/mcp", "/mcp/:token"], methodNotAllowed);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`connectwise-mcp v${SERVER_VERSION} listening on :${config.port}`);
  console.log(`  PSA (Manage) tools:  ${config.psa ? `enabled (${config.psa.site})` : "disabled — set CW_PSA_* env vars"}`);
  console.log(`  Automate tools:      ${config.automate ? `enabled (${config.automate.baseUrl})` : "disabled — set CW_AUTOMATE_* env vars"}`);
  if (!config.authToken) {
    console.warn("  WARNING: MCP_AUTH_TOKEN is not set — the /mcp endpoint is unauthenticated.");
  }
});
