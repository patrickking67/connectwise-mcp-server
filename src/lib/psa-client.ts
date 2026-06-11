import type { PsaConfig } from "../config.js";

export class CwApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CwApiError";
  }
}

export interface ClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface ListParams {
  conditions?: string;
  childConditions?: string;
  customFieldConditions?: string;
  orderBy?: string;
  fields?: string;
  page?: number;
  pageSize?: number;
}

export interface ListResult<T = unknown> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PatchOp {
  op: "add" | "replace" | "remove";
  path: string;
  value?: unknown;
}

export type Query = Record<string, string | number | boolean | undefined>;

const MAX_RETRIES = 2;
const RETRY_AFTER_CAP_S = 15;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Minimal ConnectWise PSA (Manage) REST client.
 * Auth: Basic base64(companyId+publicKey:privateKey) plus the developer clientId header.
 */
export class PsaClient {
  readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly accept: string;
  private readonly clientId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(cfg: PsaConfig, deps: ClientDeps = {}) {
    this.baseUrl = `https://${cfg.site}/v4_6_release/apis/3.0`;
    const credentials = `${cfg.companyId}+${cfg.publicKey}:${cfg.privateKey}`;
    this.authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
    this.accept = cfg.version
      ? `application/vnd.connectwise.com+json; version=${cfg.version}`
      : "application/json";
    this.clientId = cfg.clientId;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<{ data: T; response: Response }> {
    if (!path.startsWith("/")) path = `/${path}`;
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }

    let attempt = 0;
    for (;;) {
      const response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          clientId: this.clientId,
          Accept: this.accept,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after")) || 2;
        await this.sleep(Math.min(retryAfter, RETRY_AFTER_CAP_S) * 1000);
        attempt++;
        continue;
      }
      if (response.status >= 500 && attempt < 1) {
        await this.sleep(1000);
        attempt++;
        continue;
      }

      if (!response.ok) {
        throw await this.toError(response, path);
      }
      if (response.status === 204) {
        return { data: undefined as T, response };
      }
      return { data: (await response.json()) as T, response };
    }
  }

  private async toError(response: Response, path: string): Promise<CwApiError> {
    let code: string | undefined;
    let message = `${response.status} ${response.statusText} for ${path}`;
    let details: unknown;
    try {
      const body = (await response.json()) as {
        code?: string;
        message?: string;
        errors?: unknown;
      };
      code = body.code;
      if (body.message) message = body.message;
      details = body.errors ?? undefined;
    } catch {
      // non-JSON error body; keep the status line message
    }
    return new CwApiError(message, response.status, code, details);
  }

  async get<T = unknown>(path: string, query?: Query): Promise<T> {
    return (await this.request<T>("GET", path, { query })).data;
  }

  async getList<T = unknown>(path: string, params: ListParams = {}, extraQuery?: Query): Promise<ListResult<T>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const { data, response } = await this.request<T[]>("GET", path, {
      query: {
        conditions: params.conditions,
        childConditions: params.childConditions,
        customFieldConditions: params.customFieldConditions,
        orderBy: params.orderBy,
        fields: params.fields,
        page,
        pageSize,
        ...extraQuery,
      },
    });
    const link = response.headers.get("link") ?? "";
    return { items: data, page, pageSize, hasMore: /rel="next"/.test(link) };
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return (await this.request<T>("POST", path, { body })).data;
  }

  async patch<T = unknown>(path: string, ops: PatchOp[]): Promise<T> {
    return (await this.request<T>("PATCH", path, { body: ops })).data;
  }
}

/**
 * Build PATCH operations from a flat map of field path -> new value.
 * A null value clears the field (remove op); objects replace whole references,
 * which is what the PSA API requires (no paths inside reference objects).
 */
export function buildPatchOps(updates: Record<string, unknown>): PatchOp[] {
  return Object.entries(updates).map(([path, value]) =>
    value === null ? { op: "remove", path } : { op: "replace", path, value },
  );
}
