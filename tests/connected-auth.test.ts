import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { exchange } from "../src/auth/exchange";
import { GET as callback } from "../app/api/auth/callback/route";
import { GET as start } from "../app/api/auth/start/route";
import SignIn from "../app/sign-in/page";
import { db } from "../src/persistence/db";
// tsx uses the classic JSX runtime for this Next server component in Node tests.
Object.assign(globalThis, { React });

const origin = "https://receptionist.example.test";
const pending = {
  state: "test-state-do-not-log",
  verifier: "test-verifier-do-not-log",
};
const code = "test-code-do-not-log";
const grant = "test-grant-do-not-log";
const key = "test-private-machine-key-do-not-log";
const success = () =>
  Response.json({ ok: true, value: { role: "admin", grant } });

async function connected(run: (logs: unknown[][]) => Promise<void>) {
  const env = { ...process.env };
  const fetcher = globalThis.fetch;
  const query = db.query;
  const logger = console.error;
  const logs: unknown[][] = [];
  process.env.RECEPTIONIST_MODE = "connected";
  process.env.REPAIR_SERVICE_URL = "https://repairs.example.test";
  process.env.APP_ORIGIN = origin;
  process.env.REPAIR_SERVICE_TOKEN = key;
  globalThis.fetch = async () => success();
  db.query = (async () => ({
    rows: [],
    rowCount: 1,
  })) as unknown as typeof db.query;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    await run(logs);
  } finally {
    process.env = env;
    globalThis.fetch = fetcher;
    db.query = query;
    console.error = logger;
  }
}

function request(
  options: { cookie?: string; state?: string; code?: string } = {},
) {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("state", options.state ?? pending.state);
  if (options.code !== "") url.searchParams.set("code", options.code ?? code);
  return new NextRequest(url, {
    headers:
      options.cookie === ""
        ? {}
        : {
            cookie:
              "staff_auth_pending=" +
              encodeURIComponent(options.cookie ?? JSON.stringify(pending)),
          },
  });
}
const reason = (response: Response) =>
  new URL(response.headers.get("location")!).searchParams.get("error");

test("token exchange distinguishes rejected machine credentials from rejected authorization codes", async () =>
  connected(async () => {
    for (const [sourceCode, expected] of [
      ["INVALID_MACHINE_CREDENTIAL", "repair_credentials"],
      ["UNAUTHORIZED", "repair_authorization_rejected"],
    ]) {
      globalThis.fetch = async () =>
        Response.json({ ok: false, code: sourceCode }, { status: 401 });
      await assert.rejects(
        () => exchange(code, pending.verifier),
        (error: any) => error.reason === expected,
      );
    }
  }));

test("a missing connection key is explained before starting authorization", async () =>
  connected(async () => {
    delete process.env.REPAIR_SERVICE_TOKEN;
    const response = await start(new NextRequest(origin + "/api/auth/start"));
    assert.equal(reason(response), "repair_configuration");
    assert.equal(new URL(response.headers.get("location")!).origin, origin);
    assert.equal(response.cookies.has("staff_auth_pending"), false);
  }));

test("fixture mode keeps the connected authorization endpoint unavailable", async () =>
  connected(async () => {
    process.env.RECEPTIONIST_MODE = "fixture";
    const response = await start(new NextRequest(origin + "/api/auth/start"));
    assert.equal(response.status, 503);
    assert.equal(response.cookies.has("staff_auth_pending"), false);
  }));

test("alternate website origins move to the configured website before creating a connection request", async () =>
  connected(async () => {
    for (const alternate of [
      "https://preview.example.test",
      "http://localhost:3000",
    ]) {
      const response = await start(
        new NextRequest(alternate + "/api/auth/start"),
      );
      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        origin + "/api/auth/start",
      );
      assert.equal(response.cookies.has("staff_auth_pending"), false);
    }
  }));

test("canonical connection starts keep their pending state bound to the repair authorization", async () =>
  connected(async () => {
    const response = await start(new NextRequest(origin + "/api/auth/start"));
    const target = new URL(response.headers.get("location")!);
    const cookie = response.cookies.get("staff_auth_pending");
    assert.ok(cookie);
    const request = JSON.parse(cookie.value);
    assert.equal(target.origin, "https://repairs.example.test");
    assert.equal(
      target.pathname,
      "/api/integrations/receptionist/v1/authorize",
    );
    assert.equal(
      target.searchParams.get("redirect_uri"),
      origin + "/api/auth/callback",
    );
    assert.equal(target.searchParams.get("state"), request.state);
    assert.equal(typeof request.verifier, "string");
    assert.equal(request.verifier.length, 43);
    assert.equal(cookie.path, "/api/auth");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.secure, true);
  }));

test("connection responses cannot be cached across browser authorization attempts", async () =>
  connected(async () => {
    const responses = [
      await start(new NextRequest(origin + "/api/auth/start")),
      await start(
        new NextRequest("https://preview.example.test/api/auth/start"),
      ),
      await callback(request()),
      await callback(request({ cookie: "" })),
    ];
    delete process.env.REPAIR_SERVICE_TOKEN;
    responses.push(await start(new NextRequest(origin + "/api/auth/start")));
    process.env.RECEPTIONIST_MODE = "fixture";
    responses.push(await start(new NextRequest(origin + "/api/auth/start")));
    for (const response of responses)
      assert.equal(response.headers.get("cache-control"), "private, no-store");
  }));

test("missing-cookie failures log only browser presence and canonical-origin diagnostics", async () =>
  connected(async (logs) => {
    await callback(request({ cookie: "" }));
    await callback(
      new NextRequest("https://preview.example.test/api/auth/callback"),
    );
    assert.deepEqual(
      logs.map((entry) => entry[1]),
      [
        {
          reason: "connection_request_expired",
          pendingCookiePresent: false,
          originMatchesConfigured: true,
        },
        {
          reason: "connection_request_expired",
          pendingCookiePresent: false,
          originMatchesConfigured: false,
        },
      ],
    );
  }));

test("invalid website settings return a callback error on the current website", async () =>
  connected(async () => {
    for (const setting of ["not a URL", "javascript:private-config-value"]) {
      process.env.APP_ORIGIN = setting;
      const response = await callback(request());
      assert.equal(reason(response), "repair_configuration");
      assert.equal(new URL(response.headers.get("location")!).origin, origin);
      assert.equal(response.cookies.has("receptionist_session"), false);
    }
  }));

test("callback rejects missing and mismatched browser requests without contacting the repair app", async () =>
  connected(async () => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return success();
    };
    assert.equal(
      reason(await callback(request({ cookie: "" }))),
      "connection_request_expired",
    );
    assert.equal(
      reason(await callback(request({ cookie: "invalid-json" }))),
      "connection_request_expired",
    );
    const mismatch = await callback(request({ state: "another-request" }));
    assert.equal(reason(mismatch), "connection_request_mismatch");
    assert.equal(
      mismatch.cookies.has("staff_auth_pending"),
      false,
      "An older callback must not erase a newer request",
    );
    assert.equal(
      reason(await callback(request({ code: "" }))),
      "authorization_code_missing",
    );
    assert.equal(requests, 0);
  }));

test("callback reports exchange and persistence stages without exposing credentials or granting access", async () =>
  connected(async (logs) => {
    const scenarios = [
      {
        response: () =>
          Response.json(
            { ok: false, code: "INVALID_MACHINE_CREDENTIAL" },
            { status: 401 },
          ),
        expected: "repair_credentials",
      },
      {
        response: () =>
          Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 }),
        expected: "repair_authorization_rejected",
      },
      {
        response: () => new Response("private-provider-body", { status: 403 }),
        expected: "repair_response",
      },
      {
        response: () => {
          throw Error("private-network-detail " + key);
        },
        expected: "repair_unreachable",
      },
      {
        response: () =>
          Response.json({ ok: true, value: { grant, role: "staff" } }),
        expected: "admin_required",
      },
    ];
    for (const scenario of scenarios) {
      globalThis.fetch = async () => scenario.response();
      const response = await callback(request());
      assert.equal(reason(response), scenario.expected);
      assert.equal(response.cookies.has("receptionist_session"), false);
      assert.equal(
        response.cookies.get("staff_auth_pending")?.path,
        "/api/auth",
      );
    }
    globalThis.fetch = async () => success();
    db.query = (async () => {
      throw Error("private-database-detail " + key);
    }) as typeof db.query;
    const failed = await callback(request());
    assert.equal(reason(failed), "session_store");
    assert.equal(failed.cookies.has("receptionist_session"), false);
    const output = JSON.stringify(logs);
    assert.match(output, /repair_credentials|session_store/);
    for (const value of [
      code,
      pending.state,
      pending.verifier,
      key,
      grant,
      "private-provider-body",
      "private-network-detail",
      "private-database-detail",
    ])
      assert.ok(
        !output.includes(value),
        "No request credentials or raw provider/database errors may be logged",
      );
  }));

test("successful callback stores an admin session and clears the pending cookie at its original path", async () =>
  connected(async () => {
    let saved: unknown[] | undefined;
    db.query = (async (_sql: string, values: unknown[]) => {
      saved = values;
      return { rowCount: 1, rows: [] };
    }) as unknown as typeof db.query;
    const response = await callback(request());
    assert.equal(response.headers.get("location"), origin + "/");
    assert.equal(response.cookies.get("staff_auth_pending")?.path, "/api/auth");
    assert.equal(response.cookies.get("staff_auth_pending")?.maxAge, 0);
    assert.equal(response.cookies.get("receptionist_session")?.httpOnly, true);
    assert.equal(response.cookies.get("receptionist_session")?.secure, true);
    assert.equal(response.cookies.get("receptionist_session")?.sameSite, "lax");
    assert.equal(saved?.[1], "admin");
    assert.equal(saved?.[2], grant);
    assert.notEqual(
      saved?.[0],
      response.cookies.get("receptionist_session")?.value,
    );
  }));

test("connected sign-in explains allowed failure reasons and never renders raw query errors", async () =>
  connected(async () => {
    const html = renderToStaticMarkup(
      await SignIn({
        searchParams: Promise.resolve({ error: "repair_credentials" }),
      }),
    );
    assert.match(html, /role="alert"/);
    assert.match(html, /REPAIR_SERVICE_TOKEN/);
    assert.match(html, /RECEPTIONIST_API_TOKEN/);
    const unknown = renderToStaticMarkup(
      await SignIn({
        searchParams: Promise.resolve({ error: "private-untrusted-error" }),
      }),
    );
    assert.match(unknown, /role="alert"/);
    assert.ok(!unknown.includes("private-untrusted-error"));
  }));
