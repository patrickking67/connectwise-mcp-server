// Startup guards for the REMOTE entry.
//
// These spawn the built process rather than importing it, because the behaviour
// under test is the process refusing to exist. src/index.ts does its work at
// module scope and calls process.exit, so importing it would take the test runner
// down with it.
//
// Every credential here is synthetic and no test reaches ConnectWise: the guard
// fires before any client is constructed.

import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Minimum PSA configuration, so the server has tools to serve and fails only on auth. */
const PSA_ENV = {
  CW_PSA_SITE: "api-na.myconnectwise.net",
  CW_PSA_COMPANY_ID: "mock-company",
  CW_PSA_PUBLIC_KEY: "mock-public-key",
  CW_PSA_PRIVATE_KEY: "mock-private-key-not-real",
  CW_PSA_CLIENT_ID: "mock-client-id",
};

// A fixed high port per case rather than 0: loadConfig falls back to 8080 when
// PORT is falsy, and "0" is falsy, so asking for an ephemeral port would quietly
// put every case on the same one and make them collide.
let nextPort = 8571;

/**
 * Start the built remote entry and report how it ended.
 *
 * A server that starts correctly never exits on its own, so the timeout below
 * ends it with SIGTERM. `exit: 0` therefore means two things at once: it started,
 * and the drain handler caught the signal — an undrained Node process dies with
 * 143 instead. A refusal exits 1 before ever listening.
 *
 * The drain's own log line is deliberately not asserted: it is written as the
 * pipes are being torn down, so whether it reaches the parent is a race. The exit
 * code carries the same information without the flake.
 */
async function startRemote(extraEnv: Record<string, string>) {
  try {
    const { stdout, stderr } = await run(process.execPath, ["dist/index.js"], {
      env: { ...process.env, ...PSA_ENV, PORT: String(nextPort++), ...extraEnv },
      timeout: 3_000,
    });
    return { exit: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { exit: err.code ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("remote entry startup guards", () => {
  it("refuses to start with no way to authenticate a caller", async () => {
    // This connector writes to ConnectWise. An endpoint serving that to whoever
    // finds the URL is not a degraded deployment of it.
    const result = await startRemote({ MCP_AUTH_TOKEN: "", AZURE_TENANT_ID: "", AZURE_CLIENT_ID: "" });

    expect(result.exit).toBe(1);
    expect(result.stderr).toContain("Refusing to start an unauthenticated remote server");
  });

  it("starts when a shared token is configured", async () => {
    const result = await startRemote({ MCP_AUTH_TOKEN: "mock-shared-token-not-a-real-credential" });

    expect(result.exit).toBe(0);
    expect(result.stderr).not.toContain("Refusing to start");
    expect(result.stdout).toContain("listening on");
  });

  it("starts unauthenticated only when the operator says so, and says so loudly", async () => {
    const result = await startRemote({
      MCP_AUTH_TOKEN: "",
      AZURE_TENANT_ID: "",
      AZURE_CLIENT_ID: "",
      MCP_ALLOW_ANONYMOUS: "true",
    });

    expect(result.exit).toBe(0);
    expect(result.stderr).toContain("UNAUTHENTICATED");
    // The warning has to name the consequence, not just the state: this endpoint
    // can create tickets and time entries.
    expect(result.stderr).toContain("WRITE");
  });
});
