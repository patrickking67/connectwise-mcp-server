import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CwApiError } from "./psa-client.js";

/** Recursively drop null/undefined properties — PSA payloads are mostly nulls. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripNulls(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}

export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(stripNulls(data)) }],
  };
}

/**
 * A result that also carries `structuredContent`, which is what an MCP Apps card
 * renders from. The same JSON stays in `content` so hosts without MCP Apps — and the
 * model itself — see exactly what they saw before.
 */
export function uiResult(data: unknown): CallToolResult {
  const clean = stripNulls(data);
  return {
    content: [{ type: "text", text: JSON.stringify(clean) }],
    structuredContent: clean as Record<string, unknown>,
  };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): CallToolResult {
  let message: string;
  if (err instanceof CwApiError) {
    message = JSON.stringify(
      stripNulls({
        error: err.message,
        status: err.status,
        code: err.code,
        details: err.details,
      }),
    );
  } else {
    message = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wrap a tool handler so thrown errors surface as MCP tool errors, not protocol failures. */
export function safeHandler<A>(
  fn: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return errorResult(err);
    }
  };
}
