import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AutomateClient } from "../lib/automate-client.js";
import { jsonResult, errorResult, safeHandler } from "../lib/format.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const pagingShape = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(1000).optional().describe("Results per page (default 25)"),
  orderBy: z.string().optional().describe('e.g. "ComputerName asc"'),
};

export function registerAutomateTools(server: McpServer, client: AutomateClient): void {
  server.registerTool(
    "automate_search_computers",
    {
      title: "Search Automate computers",
      description:
        "Search ConnectWise Automate (RMM) agents/computers. Condition examples: ComputerName contains 'SRV', Client.Id = 5, LastContactDate > 2026-06-01.",
      inputSchema: {
        condition: z.string().optional().describe("Automate condition expression (single quotes for strings)"),
        includeFields: z
          .string()
          .optional()
          .describe("Comma-separated fields to return (defaults to a compact set)"),
        ...pagingShape,
      },
      annotations: { title: "Search Automate computers", ...READ_ONLY },
    },
    safeHandler(async (args: {
      condition?: string;
      includeFields?: string;
      page?: number;
      pageSize?: number;
      orderBy?: string;
    }) => {
      const items = await client.get<unknown[]>("/Computers", {
        condition: args.condition,
        includefields:
          args.includeFields ??
          "Id,ComputerName,Client,Location,OperatingSystemName,LastContactDate,LocalIPAddress,Status",
        pagesize: args.pageSize ?? 25,
        page: args.page ?? 1,
        orderby: args.orderBy,
      });
      return jsonResult({ count: items.length, items });
    }),
  );

  server.registerTool(
    "automate_get_computer",
    {
      title: "Get Automate computer",
      description: "Get one Automate agent/computer by id with full detail.",
      inputSchema: { id: z.number().int().describe("Computer id") },
      annotations: { title: "Get Automate computer", ...READ_ONLY },
    },
    safeHandler(async ({ id }: { id: number }) => jsonResult(await client.get(`/Computers/${id}`))),
  );

  server.registerTool(
    "automate_list_clients",
    {
      title: "List Automate clients",
      description: "List Automate clients (companies). Condition example: Name contains 'Acme'.",
      inputSchema: {
        condition: z.string().optional(),
        includeFields: z.string().optional(),
        ...pagingShape,
      },
      annotations: { title: "List Automate clients", ...READ_ONLY },
    },
    safeHandler(async (args: {
      condition?: string;
      includeFields?: string;
      page?: number;
      pageSize?: number;
      orderBy?: string;
    }) => {
      const items = await client.get<unknown[]>("/Clients", {
        condition: args.condition,
        includefields: args.includeFields,
        pagesize: args.pageSize ?? 25,
        page: args.page ?? 1,
        orderby: args.orderBy,
      });
      return jsonResult({ count: items.length, items });
    }),
  );

  server.registerTool(
    "automate_api_request",
    {
      title: "Raw Automate API request",
      description:
        "Escape hatch to the ConnectWise Automate REST API (paths relative to /cwa/api/v1). Examples: GET /Scripts; GET /Computers/123/Alerts; GET /Monitors. Non-GET requests act on live RMM agents and require confirm: true.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().regex(/^\//, "path must start with /").describe('e.g. "/Computers/123/Alerts"'),
        query: z.record(z.string()).optional(),
        body: z.unknown().optional(),
        confirm: z.boolean().optional().describe("Must be true for any non-GET request"),
      },
      annotations: { title: "Raw Automate API request", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safeHandler(async ({ method, path, query, body, confirm }: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      query?: Record<string, string>;
      body?: unknown;
      confirm?: boolean;
    }) => {
      if (method !== "GET" && confirm !== true) {
        return errorResult(
          new Error("Refusing non-GET Automate request without confirm: true — writes hit live RMM agents"),
        );
      }
      const normalized = path.replace(/^\/cwa\/api\/v1/i, "");
      return jsonResult(await client.request(method, normalized, { query, body }));
    }),
  );
}
