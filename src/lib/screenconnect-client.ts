import type { ScreenConnectConfig } from "../config.js";
import { CwApiError, type ClientDeps, type Query } from "./psa-client.js";

/**
 * Minimal ConnectWise Control (ScreenConnect) client — BETA.
 *
 * Control has no clean public REST API; integrations drive the host-page
 * `/Services/*.ashx` JSON endpoints behind forms authentication. This client
 * logs in via AuthenticationService, keeps the session cookies, and echoes the
 * anti-forgery token on writes. Endpoint shapes vary by Control version, so the
 * `screenconnect_api_request` passthrough is the reliable surface; convenience
 * tools are best-effort. Auth/CSRF behavior is instance- and version-dependent.
 */
export class ScreenConnectClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private cookies?: string;
  private antiForgeryToken?: string;

  constructor(
    private readonly cfg: ScreenConnectConfig,
    deps: ClientDeps = {},
  ) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  private async ensureSession(): Promise<void> {
    if (this.cookies) return;
    const res = await this.fetchImpl(`${this.base}/Services/AuthenticationService.ashx/TryLogin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // [userName, password, oneTimePassword, persistentClient, ...]
      body: JSON.stringify([this.cfg.username, this.cfg.password, "", "", false]),
    });
    if (!res.ok) {
      throw new CwApiError(
        `ScreenConnect login failed (${res.status} ${res.statusText})`,
        res.status,
      );
    }
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length === 0) {
      const single = res.headers.get("set-cookie");
      if (single) setCookies.push(single);
    }
    this.cookies = setCookies.map((c) => c.split(";")[0]).join("; ");
    const af = setCookies.find((c) => /antiforgery/i.test(c));
    if (af) this.antiForgeryToken = decodeURIComponent(af.split("=")[1]?.split(";")[0] ?? "");
    if (!this.cookies) {
      throw new CwApiError("ScreenConnect login returned no session cookie", 500);
    }
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
    isRetry = false,
  ): Promise<T> {
    await this.ensureSession();
    if (!path.startsWith("/")) path = `/${path}`;
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Cookie: this.cookies!,
        Accept: "application/json",
        ...(this.antiForgeryToken ? { "X-Anti-Forgery-Token": this.antiForgeryToken } : {}),
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if ((res.status === 401 || res.status === 403) && !isRetry) {
      this.cookies = undefined;
      this.antiForgeryToken = undefined;
      return this.request<T>(method, path, opts, true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CwApiError(
        `${res.status} ${res.statusText} for ${path}${text ? `: ${text.slice(0, 200)}` : ""}`,
        res.status,
      );
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("json") ? await res.json() : await res.text()) as T;
  }

  /** Best-effort host session list via the standard PageService endpoint. */
  async listSessions(sessionType = 0): Promise<unknown> {
    return this.request("POST", "/Services/PageService.ashx/GetHostSessionInfo", {
      body: [sessionType, [], "", 0, "", 100],
    });
  }
}
