import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ScreenConnectClient } from "../lib/screenconnect-client.js";
import { jsonResult, errorResult, safeHandler } from "../lib/format.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export function registerScreenConnectTools(server: McpServer, client: ScreenConnectClient): void {
  server.registerTool(
    "screenconnect_list_sessions",
    {
      title: "List ScreenConnect sessions (beta)",
      description:
        "List ConnectWise Control (ScreenConnect) host sessions — access machines, support, or meetings. BETA: the response shape is Control-version-specific; if this errors, use screenconnect_api_request.",
      inputSchema: {
        sessionType: z
          .enum(["Access", "Support", "Meeting"])
          .optional()
          .describe("Session type (default Access — unattended machines)"),
      },
      annotations: { title: "List ScreenConnect sessions", ...READ_ONLY },
    },
    safeHandler(async ({ sessionType }: { sessionType?: "Access" | "Support" | "Meeting" }) => {
      const typeMap = { Support: 0, Meeting: 1, Access: 2 } as const;
      return jsonResult(await client.listSessions(typeMap[sessionType ?? "Access"]));
    }),
  );

  server.registerTool(
    "screenconnect_api_request",
    {
      title: "Raw ScreenConnect API request (beta)",
      description:
        "Authenticated passthrough to a ConnectWise Control (ScreenConnect) instance. Paths are relative to the instance root, e.g. POST /Services/PageService.ashx/GetHostSessionInfo or /Services/SessionGroupService.ashx. BETA: endpoint signatures are version-specific. Non-GET requests act on live remote-access infrastructure and require confirm: true.",
      inputSchema: {
        method: z.enum(["GET", "POST"]),
        path: z.string().regex(/^\//, "path must start with /").describe('e.g. "/Services/PageService.ashx/GetHostSessionInfo"'),
        query: z.record(z.string()).optional(),
        body: z.unknown().optional().describe("JSON body — for .ashx services this is usually a positional argument array"),
        confirm: z.boolean().optional().describe("Must be true for POST"),
      },
      annotations: { title: "Raw ScreenConnect API request", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safeHandler(async ({ method, path, query, body, confirm }: {
      method: "GET" | "POST";
      path: string;
      query?: Record<string, string>;
      body?: unknown;
      confirm?: boolean;
    }) => {
      if (method === "POST" && confirm !== true) {
        return errorResult(new Error("Refusing POST without confirm: true — ScreenConnect writes hit live remote-access infrastructure"));
      }
      return jsonResult(await client.request(method, path, { query, body }));
    }),
  );
}
