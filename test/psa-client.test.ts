import { describe, expect, it, vi } from "vitest";
import { CwApiError, PsaClient, buildPatchOps } from "../src/lib/psa-client.js";
import type { PsaConfig } from "../src/config.js";

const CFG: PsaConfig = {
  site: "api-na.myconnectwise.net",
  companyId: "mycompany",
  publicKey: "pub",
  privateKey: "priv",
  clientId: "my-client-guid",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("PsaClient", () => {
  it("sends Basic auth, clientId, and Accept headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "v2026.4" }));
    const client = new PsaClient(CFG, { fetchImpl });
    await client.get("/system/info");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api-na.myconnectwise.net/v4_6_release/apis/3.0/system/info");
    const expected = Buffer.from("mycompany+pub:priv").toString("base64");
    expect(init.headers.Authorization).toBe(`Basic ${expected}`);
    expect(init.headers.clientId).toBe("my-client-guid");
    expect(init.headers.Accept).toBe("application/json");
  });

  it("pins the API version via the Accept header when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const client = new PsaClient({ ...CFG, version: "2026.4" }, { fetchImpl });
    await client.get("/system/info");
    expect(fetchImpl.mock.calls[0][1].headers.Accept).toBe(
      "application/vnd.connectwise.com+json; version=2026.4",
    );
  });

  it("builds list query strings and reports pagination from the Link header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 1 }], {
        headers: {
          "content-type": "application/json",
          link: '<https://x/page=2>; rel="next", <https://x/page=9>; rel="last"',
        },
      }),
    );
    const client = new PsaClient(CFG, { fetchImpl });
    const result = await client.getList("/service/tickets", {
      conditions: 'status/name="New" and closedFlag=false',
      fields: "id,summary",
      page: 1,
      pageSize: 50,
    });

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get("conditions")).toBe('status/name="New" and closedFlag=false');
    expect(url.searchParams.get("fields")).toBe("id,summary");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(result).toEqual({ items: [{ id: 1 }], page: 1, pageSize: 50, hasMore: true });
  });

  it("retries 429 responses honoring Retry-After", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Too many requests" }), {
          status: 429,
          headers: { "retry-after": "3" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new PsaClient(CFG, { fetchImpl, sleep });

    const data = await client.get<{ ok: boolean }>("/system/info");
    expect(data.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caps Retry-After waits", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "120" } }))
      .mockResolvedValueOnce(jsonResponse({}));
    const client = new PsaClient(CFG, { fetchImpl, sleep });
    await client.get("/system/info");
    expect(sleep).toHaveBeenCalledWith(15000);
  });

  it("surfaces ConnectWise error bodies as CwApiError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "InvalidObject", message: "summary is required", errors: [{ field: "summary" }] }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    const client = new PsaClient(CFG, { fetchImpl });

    const err = (await client.get("/service/tickets").catch((e) => e)) as CwApiError;
    expect(err).toBeInstanceOf(CwApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("InvalidObject");
    expect(err.message).toBe("summary is required");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 4xx is never retried
  });

  it("retries 5xx once", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("oops", { status: 502, statusText: "Bad Gateway" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new PsaClient(CFG, { fetchImpl, sleep });
    const data = await client.get<{ ok: boolean }>("/system/info");
    expect(data.ok).toBe(true);
  });
});

describe("buildPatchOps", () => {
  it("maps values to replace ops and nulls to remove ops", () => {
    expect(
      buildPatchOps({ summary: "New", status: { name: "Closed" }, owner: null }),
    ).toEqual([
      { op: "replace", path: "summary", value: "New" },
      { op: "replace", path: "status", value: { name: "Closed" } },
      { op: "remove", path: "owner" },
    ]);
  });
});
