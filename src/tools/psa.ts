import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PsaClient, buildPatchOps, type ListParams } from "../lib/psa-client.js";
import { jsonResult, errorResult, safeHandler } from "../lib/format.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

const pageShape = {
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Results per page (default 25, max 1000)"),
};

function listShape(conditionHint: string) {
  return {
    conditions: z
      .string()
      .optional()
      .describe(`Filter expression, e.g. ${conditionHint} — see server instructions for syntax`),
    orderBy: z.string().optional().describe('Sort field and direction, e.g. "id desc"'),
    fields: z
      .string()
      .optional()
      .describe('Comma-separated fields to return; "all" for full records. Defaults to a compact set.'),
    ...pageShape,
  };
}

/** fields: omitted -> compact default, "all" -> full record, anything else -> caller's list */
function resolveFields(input: string | undefined, fallback?: string): string | undefined {
  if (input === "all") return undefined;
  return input || fallback;
}

type SearchArgs = ListParams & { childConditions?: string; customFieldConditions?: string };

interface SearchSpec {
  name: string;
  title: string;
  path: string;
  description: string;
  conditionHint: string;
  defaultFields: string;
  childConditionsHint?: string;
  customFieldConditions?: boolean;
}

const SEARCHES: SearchSpec[] = [
  {
    name: "psa_search_tickets",
    title: "Search service tickets",
    path: "/service/tickets",
    description: "Search PSA service tickets (helpdesk). Returns a compact summary per ticket.",
    conditionHint:
      'status/name="New" and board/name="Help Desk", summary contains "vpn", company/identifier="acme", owner/identifier="pking", closedFlag=false, lastUpdated > [2026-06-01T00:00:00Z]',
    defaultFields:
      "id,summary,recordType,board/name,status/name,priority/name,company/identifier,contact/name,owner/identifier,closedFlag",
    customFieldConditions: true,
  },
  {
    name: "psa_search_companies",
    title: "Search companies",
    path: "/company/companies",
    description: "Search PSA companies (clients/vendors).",
    conditionHint: 'name like "acme%", identifier="acme", status/name="Active"',
    defaultFields: "id,identifier,name,status/name,phoneNumber,city,state,website",
    childConditionsHint: 'Filter on child arrays, e.g. types/name="Managed"',
    customFieldConditions: true,
  },
  {
    name: "psa_search_contacts",
    title: "Search contacts",
    path: "/company/contacts",
    description: "Search PSA contacts. Email lives in communicationItems — search it via childConditions.",
    conditionHint: 'firstName like "Pat%" and company/identifier="acme", inactiveFlag=false',
    defaultFields: "id,firstName,lastName,title,company/identifier,defaultPhoneNbr,inactiveFlag",
    childConditionsHint:
      'e.g. communicationItems/value like "john@acme.com" AND communicationItems/communicationType="Email"',
    customFieldConditions: true,
  },
  {
    name: "psa_search_configurations",
    title: "Search configurations (assets)",
    path: "/company/configurations",
    description: "Search PSA configurations — managed devices/assets tracked per company.",
    conditionHint:
      'company/identifier="acme" and activeFlag=true, type/name="Managed Workstation", serialNumber="ABC123", name contains "SRV"',
    defaultFields:
      "id,name,type/name,status/name,company/identifier,serialNumber,tagNumber,ipAddress,osType,lastLoginName,activeFlag",
    customFieldConditions: true,
  },
  {
    name: "psa_search_time_entries",
    title: "Search time entries",
    path: "/time/entries",
    description: "Search PSA time entries.",
    conditionHint:
      'member/identifier="pking" and timeStart > [2026-06-01T00:00:00Z], chargeToId=12345 and chargeToType="ServiceTicket"',
    defaultFields:
      "id,company/identifier,member/identifier,chargeToType,chargeToId,timeStart,timeEnd,actualHours,billableOption,notes",
  },
  {
    name: "psa_search_projects",
    title: "Search projects",
    path: "/project/projects",
    description: "Search PSA projects.",
    conditionHint: 'company/identifier="acme" and closedFlag=false, status/name="Open"',
    defaultFields:
      "id,name,company/identifier,status/name,board/name,manager/identifier,estimatedEnd,actualHours,budgetHours,closedFlag",
  },
  {
    name: "psa_search_project_tickets",
    title: "Search project tickets",
    path: "/project/tickets",
    description: "Search project tickets (work items inside projects — separate from service tickets).",
    conditionHint: 'project/id=123, phase/name contains "Deploy", closedFlag=false, wbsCode="1.2"',
    defaultFields:
      "id,summary,wbsCode,project/name,phase/name,status/name,company/identifier,owner/identifier,closedFlag",
  },
  {
    name: "psa_search_purchase_orders",
    title: "Search purchase orders",
    path: "/procurement/purchaseorders",
    description: "Search procurement purchase orders.",
    conditionHint: 'vendorCompany/identifier="ingram", closedFlag=false, poNumber="PO-1234"',
    defaultFields: "id,poNumber,status/name,vendorCompany/identifier,shipmentDate,total,closedFlag",
  },
  {
    name: "psa_search_opportunities",
    title: "Search sales opportunities",
    path: "/sales/opportunities",
    description: "Search PSA sales opportunities.",
    conditionHint: 'company/identifier="acme", stage/name="Qualification", expectedCloseDate < [2026-09-30T00:00:00Z]',
    defaultFields:
      "id,name,company/identifier,contact/name,stage/name,status/name,expectedCloseDate,primarySalesRep/identifier",
  },
  {
    name: "psa_search_agreements",
    title: "Search agreements",
    path: "/finance/agreements",
    description: "Search PSA agreements (managed service contracts).",
    conditionHint: 'company/identifier="acme" and agreementStatus="Active", type/name contains "Managed"',
    defaultFields: "id,name,type/name,company/identifier,agreementStatus,startDate,endDate",
  },
  {
    name: "psa_search_invoices",
    title: "Search invoices",
    path: "/finance/invoices",
    description: "Search PSA invoices.",
    conditionHint: 'company/identifier="acme" and balance > 0, date > [2026-01-01T00:00:00Z]',
    defaultFields: "id,invoiceNumber,type,company/identifier,status/name,date,dueDate,total,balance",
  },
  {
    name: "psa_search_members",
    title: "Search members (technicians)",
    path: "/system/members",
    description: "Search PSA members — internal users/technicians.",
    conditionHint: 'inactiveFlag=false, identifier="pking", lastName like "King%"',
    defaultFields: "id,identifier,firstName,lastName,primaryEmail,title,inactiveFlag",
  },
  {
    name: "psa_search_activities",
    title: "Search sales activities",
    path: "/sales/activities",
    description: "Search PSA sales activities (calls, meetings, tasks).",
    conditionHint: 'assignTo/identifier="pking" and status/name="Open", company/identifier="acme"',
    defaultFields:
      "id,name,type/name,status/name,company/identifier,contact/name,assignTo/identifier,dateStart,dateEnd",
  },
  {
    name: "psa_search_schedule_entries",
    title: "Search schedule entries",
    path: "/schedule/entries",
    description: "Search PSA schedule entries (dispatch calendar). objectId is the scheduled ticket/activity id.",
    conditionHint: 'member/identifier="pking" and dateStart > [2026-06-10T00:00:00Z], doneFlag=false',
    defaultFields: "id,name,objectId,type/name,member/identifier,dateStart,dateEnd,doneFlag,status/name",
  },
];

function registerSearchTools(server: McpServer, client: PsaClient): void {
  for (const spec of SEARCHES) {
    const shape: Record<string, z.ZodTypeAny> = listShape(spec.conditionHint);
    if (spec.childConditionsHint) {
      shape.childConditions = z.string().optional().describe(spec.childConditionsHint);
    }
    if (spec.customFieldConditions) {
      shape.customFieldConditions = z
        .string()
        .optional()
        .describe('Filter on custom fields, e.g. caption="VIP" AND value=true');
    }
    server.registerTool(
      spec.name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: shape,
        annotations: { title: spec.title, ...READ_ONLY },
      },
      safeHandler(async (args: SearchArgs) => {
        const result = await client.getList(spec.path, {
          ...args,
          fields: resolveFields(args.fields, spec.defaultFields),
        });
        return jsonResult({
          count: result.items.length,
          page: result.page,
          hasMore: result.hasMore,
          items: result.items,
        });
      }),
    );
  }
}

function escapeCondition(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function registerPsaTools(server: McpServer, client: PsaClient): void {
  registerSearchTools(server, client);

  server.registerTool(
    "psa_system_info",
    {
      title: "PSA system info",
      description:
        "Get ConnectWise PSA instance info (version, cloud/on-prem). Cheap connectivity and credentials check.",
      inputSchema: {},
      annotations: { title: "PSA system info", ...READ_ONLY },
    },
    safeHandler(async () => jsonResult(await client.get("/system/info"))),
  );

  server.registerTool(
    "psa_get_ticket",
    {
      title: "Get ticket",
      description: "Get one service ticket by id with full detail, including its notes by default.",
      inputSchema: {
        id: z.number().int().describe("Ticket id"),
        includeNotes: z.boolean().optional().describe("Also fetch the ticket's notes (default true)"),
      },
      annotations: { title: "Get ticket", ...READ_ONLY },
    },
    safeHandler(async ({ id, includeNotes }: { id: number; includeNotes?: boolean }) => {
      const ticket = await client.get(`/service/tickets/${id}`);
      if (includeNotes === false) return jsonResult({ ticket });
      const notes = await client.getList(`/service/tickets/${id}/allNotes`, { pageSize: 25 });
      return jsonResult({
        ticket,
        notes: { count: notes.items.length, hasMore: notes.hasMore, items: notes.items },
      });
    }),
  );

  server.registerTool(
    "psa_get_ticket_notes",
    {
      title: "Get ticket notes",
      description:
        "Page through all notes on a ticket (discussion, internal analysis, resolution, and time-entry notes).",
      inputSchema: { ticketId: z.number().int(), ...pageShape },
      annotations: { title: "Get ticket notes", ...READ_ONLY },
    },
    safeHandler(async ({ ticketId, page, pageSize }: { ticketId: number; page?: number; pageSize?: number }) => {
      const notes = await client.getList(`/service/tickets/${ticketId}/allNotes`, { page, pageSize });
      return jsonResult({
        count: notes.items.length,
        page: notes.page,
        hasMore: notes.hasMore,
        items: notes.items,
      });
    }),
  );

  server.registerTool(
    "psa_create_ticket",
    {
      title: "Create ticket",
      description:
        "Create a service ticket. Company is required (identifier or id). Board/status/priority default from company settings when omitted; use psa_list_boards + psa_get_board_info for valid names.",
      inputSchema: {
        summary: z.string().min(1).max(100).describe("Ticket summary (max 100 chars)"),
        companyIdentifier: z.string().optional().describe('Company identifier, e.g. "acme" (this or companyId required)'),
        companyId: z.number().int().optional().describe("Company record id"),
        board: z.string().optional().describe('Board name, e.g. "Help Desk"'),
        status: z.string().optional().describe("Status name valid for the board"),
        priority: z.string().optional().describe('Priority name, e.g. "Priority 3 - Medium"'),
        type: z.string().optional().describe("Ticket type name (board-specific)"),
        subType: z.string().optional(),
        item: z.string().optional(),
        contactId: z.number().int().optional().describe("Contact record id"),
        ownerIdentifier: z.string().optional().describe("Member identifier to assign as owner"),
        initialDescription: z.string().optional().describe("Body of the first (discussion) note"),
        severity: z.enum(["Low", "Medium", "High"]).optional(),
        impact: z.enum(["Low", "Medium", "High"]).optional(),
      },
      annotations: { title: "Create ticket", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safeHandler(async (args: {
      summary: string;
      companyIdentifier?: string;
      companyId?: number;
      board?: string;
      status?: string;
      priority?: string;
      type?: string;
      subType?: string;
      item?: string;
      contactId?: number;
      ownerIdentifier?: string;
      initialDescription?: string;
      severity?: string;
      impact?: string;
    }) => {
      if (!args.companyIdentifier && args.companyId === undefined) {
        return errorResult(new Error("Provide companyIdentifier or companyId"));
      }
      const body = {
        summary: args.summary,
        company: args.companyId !== undefined ? { id: args.companyId } : { identifier: args.companyIdentifier },
        board: args.board ? { name: args.board } : undefined,
        status: args.status ? { name: args.status } : undefined,
        priority: args.priority ? { name: args.priority } : undefined,
        type: args.type ? { name: args.type } : undefined,
        subType: args.subType ? { name: args.subType } : undefined,
        item: args.item ? { name: args.item } : undefined,
        contact: args.contactId !== undefined ? { id: args.contactId } : undefined,
        owner: args.ownerIdentifier ? { identifier: args.ownerIdentifier } : undefined,
        initialDescription: args.initialDescription,
        severity: args.severity,
        impact: args.impact,
      };
      return jsonResult(await client.post("/service/tickets", body));
    }),
  );

  server.registerTool(
    "psa_update_ticket",
    {
      title: "Update ticket",
      description:
        'Update fields on a service ticket via PATCH. `updates` maps field path -> new value; reference fields take whole objects, e.g. {"status":{"name":"In Progress"},"owner":{"identifier":"pking"},"priority":{"name":"Priority 2"},"summary":"New summary"}. A null value clears the field. customFields must be passed as the complete array.',
      inputSchema: {
        id: z.number().int().describe("Ticket id"),
        updates: z.record(z.unknown()).describe("Field path -> new value map"),
      },
      annotations: { title: "Update ticket", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    safeHandler(async ({ id, updates }: { id: number; updates: Record<string, unknown> }) => {
      if (Object.keys(updates).length === 0) return errorResult(new Error("updates is empty"));
      return jsonResult(await client.patch(`/service/tickets/${id}`, buildPatchOps(updates)));
    }),
  );

  server.registerTool(
    "psa_add_ticket_note",
    {
      title: "Add ticket note",
      description: "Add a note to a service ticket.",
      inputSchema: {
        ticketId: z.number().int(),
        text: z.string().min(1),
        noteType: z
          .enum(["discussion", "internal", "resolution"])
          .optional()
          .describe("Which ticket section the note lands in (default discussion)"),
        internal: z.boolean().optional().describe("Hide from the customer portal (default false)"),
      },
      annotations: { title: "Add ticket note", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safeHandler(async ({ ticketId, text, noteType, internal }: {
      ticketId: number;
      text: string;
      noteType?: "discussion" | "internal" | "resolution";
      internal?: boolean;
    }) => {
      const kind = noteType ?? "discussion";
      const body = {
        text,
        detailDescriptionFlag: kind === "discussion",
        internalAnalysisFlag: kind === "internal",
        resolutionFlag: kind === "resolution",
        internalFlag: internal ?? false,
      };
      return jsonResult(await client.post(`/service/tickets/${ticketId}/notes`, body));
    }),
  );

  server.registerTool(
    "psa_get_company",
    {
      title: "Get company",
      description: "Get one company with full detail, by record id (number) or identifier (string).",
      inputSchema: {
        company: z.union([z.number().int(), z.string()]).describe('Company id (number) or identifier (string), e.g. 250 or "acme"'),
      },
      annotations: { title: "Get company", ...READ_ONLY },
    },
    safeHandler(async ({ company }: { company: number | string }) => {
      if (typeof company === "number") {
        return jsonResult(await client.get(`/company/companies/${company}`));
      }
      const result = await client.getList("/company/companies", {
        conditions: `identifier="${escapeCondition(company)}"`,
        pageSize: 1,
      });
      if (result.items.length === 0) {
        return errorResult(new Error(`Company not found: ${company}`));
      }
      return jsonResult(result.items[0]);
    }),
  );

  server.registerTool(
    "psa_create_time_entry",
    {
      title: "Create time entry",
      description: "Log time against a ticket, project ticket, activity, or charge code.",
      inputSchema: {
        chargeToType: z.enum(["ServiceTicket", "ProjectTicket", "ChargeCode", "Activity"]),
        chargeToId: z.number().int().describe("Id of the ticket/activity/charge code"),
        timeStart: z.string().describe("UTC ISO-8601 start, e.g. 2026-06-10T17:00:00Z"),
        timeEnd: z.string().optional().describe("UTC ISO-8601 end"),
        notes: z.string().optional().describe("Work performed (customer-visible per billing setup)"),
        internalNotes: z.string().optional(),
        billableOption: z.enum(["Billable", "DoNotBill", "NoCharge", "NoDefault"]).optional(),
        memberIdentifier: z.string().optional().describe("Member to log time for (defaults to the API member)"),
        workRole: z.string().optional().describe("Work role name"),
      },
      annotations: { title: "Create time entry", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safeHandler(async (args: {
      chargeToType: string;
      chargeToId: number;
      timeStart: string;
      timeEnd?: string;
      notes?: string;
      internalNotes?: string;
      billableOption?: string;
      memberIdentifier?: string;
      workRole?: string;
    }) => {
      const body = {
        chargeToType: args.chargeToType,
        chargeToId: args.chargeToId,
        timeStart: args.timeStart,
        timeEnd: args.timeEnd,
        notes: args.notes,
        internalNotes: args.internalNotes,
        billableOption: args.billableOption,
        member: args.memberIdentifier ? { identifier: args.memberIdentifier } : undefined,
        workRole: args.workRole ? { name: args.workRole } : undefined,
      };
      return jsonResult(await client.post("/time/entries", body));
    }),
  );

  server.registerTool(
    "psa_list_boards",
    {
      title: "List service boards",
      description: "List service boards. Use before creating/moving tickets to find valid board names.",
      inputSchema: {
        conditions: z.string().optional().describe('e.g. inactiveFlag=false or projectFlag=false'),
        ...pageShape,
      },
      annotations: { title: "List service boards", ...READ_ONLY },
    },
    safeHandler(async ({ conditions, page, pageSize }: { conditions?: string; page?: number; pageSize?: number }) => {
      const result = await client.getList("/service/boards", {
        conditions,
        page,
        pageSize: pageSize ?? 100,
        fields: "id,name,inactiveFlag,projectFlag",
      });
      return jsonResult({ count: result.items.length, hasMore: result.hasMore, items: result.items });
    }),
  );

  server.registerTool(
    "psa_get_board_info",
    {
      title: "Get board statuses/types/subtypes",
      description:
        "Get the valid statuses, types, and subtypes for one service board — needed to set those fields on tickets.",
      inputSchema: { boardId: z.number().int() },
      annotations: { title: "Get board info", ...READ_ONLY },
    },
    safeHandler(async ({ boardId }: { boardId: number }) => {
      const [statuses, types, subTypes] = await Promise.all([
        client.getList(`/service/boards/${boardId}/statuses`, {
          pageSize: 200,
          fields: "id,name,sortOrder,closedStatus,defaultFlag,inactive",
        }),
        client.getList(`/service/boards/${boardId}/types`, { pageSize: 200, fields: "id,name" }),
        client.getList(`/service/boards/${boardId}/subtypes`, { pageSize: 200, fields: "id,name" }),
      ]);
      return jsonResult({ statuses: statuses.items, types: types.items, subTypes: subTypes.items });
    }),
  );

  server.registerTool(
    "psa_get_agreement_additions",
    {
      title: "Get agreement additions",
      description:
        "List the additions (billed line items: licenses, seats, products) on one agreement — what the client is actually billed for.",
      inputSchema: {
        agreementId: z.number().int(),
        conditions: z.string().optional().describe('e.g. cancelledDate=null or agreementStatus="Active"'),
        ...pageShape,
      },
      annotations: { title: "Get agreement additions", ...READ_ONLY },
    },
    safeHandler(async ({ agreementId, conditions, page, pageSize }: {
      agreementId: number;
      conditions?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const result = await client.getList(`/finance/agreements/${agreementId}/additions`, {
        conditions,
        page,
        pageSize,
        fields:
          "id,product/identifier,description,quantity,unitPrice,unitCost,effectiveDate,cancelledDate,agreementStatus,lessIncluded",
      });
      return jsonResult({ count: result.items.length, hasMore: result.hasMore, items: result.items });
    }),
  );

  server.registerTool(
    "psa_get_ticket_tasks",
    {
      title: "Get ticket tasks",
      description: "List the checklist tasks on a service ticket.",
      inputSchema: { ticketId: z.number().int(), ...pageShape },
      annotations: { title: "Get ticket tasks", ...READ_ONLY },
    },
    safeHandler(async ({ ticketId, page, pageSize }: { ticketId: number; page?: number; pageSize?: number }) => {
      const result = await client.getList(`/service/tickets/${ticketId}/tasks`, {
        page,
        pageSize,
        fields: "id,summary,notes,closedFlag,resolution",
      });
      return jsonResult({ count: result.items.length, hasMore: result.hasMore, items: result.items });
    }),
  );

  server.registerTool(
    "psa_api_request",
    {
      title: "Raw PSA API request",
      description:
        "Escape hatch to the full ConnectWise PSA REST API (1,800+ endpoints) when no dedicated tool fits. Examples: GET /service/priorities; GET /system/departments; GET /sales/stages; GET /procurement/purchaseorders. List endpoints accept query params conditions/fields/orderBy/page/pageSize. Prefer the dedicated tools when one exists.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z
          .string()
          .regex(/^\//, "path must start with /")
          .describe('API path, e.g. "/service/priorities"'),
        query: z.record(z.string()).optional().describe("Query string parameters"),
        body: z.unknown().optional().describe("JSON body for POST/PUT; array of {op,path,value} ops for PATCH"),
        confirm: z.boolean().optional().describe("Must be true for DELETE — deletions are permanent"),
      },
      annotations: { title: "Raw PSA API request", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safeHandler(async ({ method, path, query, body, confirm }: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      query?: Record<string, string>;
      body?: unknown;
      confirm?: boolean;
    }) => {
      if (method === "DELETE" && confirm !== true) {
        return errorResult(new Error("Refusing DELETE without confirm: true — PSA deletions cannot be undone"));
      }
      const normalized = path.replace(/^\/v4_6_release\/apis\/3\.0/, "");
      const { data, response } = await client.request(method, normalized, { query, body });
      const hasMore = /rel="next"/.test(response.headers.get("link") ?? "");
      return jsonResult(Array.isArray(data) ? { count: data.length, hasMore, items: data } : (data ?? { status: response.status }));
    }),
  );
}
