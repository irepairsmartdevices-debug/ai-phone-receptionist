import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { db } from "../src/persistence/db";
import {
  getAIReadiness,
  runAIConnectionCheck,
} from "../src/providers/readiness";
import { POST } from "../app/api/ai/check/route";

const env = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "private-test-google-key-never-return",
  GEMINI_MODEL: "gemini-3.8-flash",
};
let previous: unknown;
before(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  previous = (
    await db.query("SELECT value FROM settings WHERE key='ai:connection-check'")
  ).rows[0]?.value;
  await db.query("DELETE FROM settings WHERE key='ai:connection-check'");
});
after(async () => {
  await db.query("DELETE FROM settings WHERE key='ai:connection-check'");
  if (previous !== undefined)
    await db.query(
      "INSERT INTO settings(key,value) VALUES('ai:connection-check',$1)",
      [JSON.stringify(previous)],
    );
});
const good = () =>
  Response.json({
    candidates: [
      { content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" },
    ],
  });

test("a configured key stays unverified until a real structured check succeeds", async () => {
  const status = await getAIReadiness(env);
  assert.equal(status.configured, true);
  assert.equal(status.lastCheck, null);
  const checked = await runAIConnectionCheck(env, async (_url, init) => {
    assert.ok(!String(init?.body).includes("customer"));
    return good();
  });
  assert.equal(checked.status, 200);
  assert.equal(checked.readiness.lastCheck?.ok, true);
  assert.ok(checked.readiness.lastCheck?.checkedAt);
  assert.ok(!JSON.stringify(checked).includes(env.GEMINI_API_KEY));
  assert.ok(!JSON.stringify(checked).includes("fingerprint"));
  assert.equal((await getAIReadiness(env)).lastCheck?.ok, true);
});

test("parallel or repeated connection checks reserve one provider request and return retry timing", async () => {
  const isolated = { ...env, GEMINI_API_KEY: "private-concurrent-check-key" };
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return good();
  };
  const results = await Promise.all([
    runAIConnectionCheck(isolated, fetcher),
    runAIConnectionCheck(isolated, fetcher),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
  assert.equal(calls, 1);
  assert.ok(results.find((r) => r.status === 429)?.retryAfter);
});

test("a slow check remains reserved while its longer provider deadline is settling", async (t) => {
  const isolated = { ...env, GEMINI_API_KEY: "private-slow-reservation-key" };
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reachedProvider = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const first = runAIConnectionCheck(isolated, async () => {
    calls++;
    started();
    await waiting;
    return good();
  });
  await reachedProvider;
  try {
    now += 31_000;
    const second = await runAIConnectionCheck(isolated, async () => {
      calls++;
      return good();
    });
    assert.equal(second.status, 429);
    assert.ok(second.retryAfter && second.retryAfter > 0);
    assert.equal(calls, 1);
  } finally {
    release();
    await first;
  }
});

test("changed key or model invalidates old success and a failed check never leaks raw provider errors", async () => {
  const changed = { ...env, GEMINI_API_KEY: "private-changed-check-key" };
  assert.equal((await getAIReadiness(changed)).lastCheck, null);
  const result = await runAIConnectionCheck(changed, async () =>
    Response.json(
      {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "raw-private-provider-body",
        },
      },
      { status: 403 },
    ),
  );
  assert.equal(result.readiness.lastCheck?.ok, false);
  assert.equal(result.readiness.lastCheck?.reason, "authentication");
  assert.ok(!JSON.stringify(result).includes("raw-private-provider-body"));
  assert.equal(
    (await getAIReadiness({ ...changed, GEMINI_MODEL: "another-model" }))
      .lastCheck,
    null,
  );
});

test("missing Gemini key does not send a paid provider check", async () => {
  const result = await runAIConnectionCheck(
    { ...env, GEMINI_API_KEY: "" },
    async () => {
      throw Error("must not call");
    },
  );
  assert.equal(result.readiness.configured, false);
  assert.equal(result.readiness.reason, "missing_key");
  assert.equal(result.readiness.lastCheck, null);
});

test("connection details distinguish a provider timeout and survive reload without private data", async () => {
  const isolated = { ...env, GEMINI_API_KEY: "private-provider-timeout-key" };
  let calls = 0;
  const checked = await runAIConnectionCheck(isolated, async () => {
    calls++;
    return new Response("private-provider-body", { status: 504 });
  });
  const detail = checked.readiness.lastCheck?.diagnostic;
  assert.equal(checked.readiness.lastCheck?.reason, "timeout");
  assert.equal(detail?.source, "provider_http");
  assert.equal(detail?.httpStatus, 504);
  assert.equal(detail?.phase, "response");
  assert.ok(detail && detail.elapsedMs >= 0);
  assert.equal(calls, 1);
  assert.deepEqual(
    (await getAIReadiness(isolated)).lastCheck?.diagnostic,
    detail,
  );
  await db.query(
    "UPDATE settings SET value=jsonb_set(value,'{lastCheck,diagnostic,rawError}',to_jsonb($1::text)) WHERE key='ai:connection-check'",
    ["private-injected-provider-message"],
  );
  assert.deepEqual(
    (await getAIReadiness(isolated)).lastCheck?.diagnostic,
    detail,
  );
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private-provider|signature|requestId/,
  );
});

test("Google request errors retain only safe status and request-setting hints", async () => {
  const isolated = { ...env, GEMINI_API_KEY: "private-request-hint-key" };
  const checked = await runAIConnectionCheck(isolated, async () =>
    Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "private-message-with-a-key-and-customer-data",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              fieldViolations: [
                {
                  field: "generation_config.thinking_config.thinking_level",
                  description: "private-rejection-description",
                },
                {
                  field: "private-arbitrary-field",
                  description: "private-field-description",
                },
              ],
            },
          ],
        },
      },
      { status: 400 },
    ),
  );
  assert.equal(checked.readiness.lastCheck?.reason, "model");
  assert.equal(
    checked.readiness.lastCheck?.diagnostic?.providerCode,
    "INVALID_ARGUMENT",
  );
  assert.deepEqual(checked.readiness.lastCheck?.diagnostic?.parameters, [
    "thinking_level",
  ]);
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private-request|private-message|private-rejection|private-arbitrary|private-field/,
  );
  assert.deepEqual(
    (await getAIReadiness(isolated)).lastCheck?.diagnostic,
    checked.readiness.lastCheck?.diagnostic,
  );
});

test("Google API-key rejection details remain explicit without exposing the key", async () => {
  const isolated = { ...env, GEMINI_API_KEY: "private-request-key-rejection" };
  const checked = await runAIConnectionCheck(isolated, async () =>
    Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "private-request-key-rejection",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "API_KEY_INVALID",
              metadata: { secret: "private-key-metadata" },
            },
          ],
        },
      },
      { status: 400 },
    ),
  );
  assert.equal(checked.readiness.lastCheck?.reason, "authentication");
  assert.equal(
    checked.readiness.lastCheck?.diagnostic?.providerReason,
    "API_KEY_INVALID",
  );
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private-request|private-key-metadata|metadata/,
  );
});

test("unknown provider error values are omitted and only known parameter names are reported", async () => {
  const isolated = {
    ...env,
    GEMINI_API_KEY: "private-unknown-provider-details",
  };
  const checked = await runAIConnectionCheck(isolated, async () =>
    Response.json(
      {
        error: {
          status: "private-provider-status",
          message:
            'Invalid payload field "responseJsonSchema" private-provider-message',
          details: [
            {
              reason: "private-provider-reason",
              fieldViolations: [{ field: "private-provider-field" }],
            },
          ],
        },
      },
      { status: 400 },
    ),
  );
  assert.equal(
    checked.readiness.lastCheck?.diagnostic?.providerCode,
    undefined,
  );
  assert.equal(
    checked.readiness.lastCheck?.diagnostic?.providerReason,
    undefined,
  );
  assert.deepEqual(checked.readiness.lastCheck?.diagnostic?.parameters, [
    "response_schema",
  ]);
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private-provider|private-unknown/,
  );
});

test("connection details identify app deadlines before headers and while reading a body", async (t) => {
  t.mock.method(AbortSignal, "timeout", () =>
    AbortSignal.abort(
      new DOMException("private-timeout-message", "TimeoutError"),
    ),
  );
  for (const phase of ["request", "response"] as const) {
    const isolated = {
      ...env,
      GEMINI_API_KEY: `private-deadline-${phase}-key`,
    };
    const checked = await runAIConnectionCheck(isolated, async (_url, init) => {
      if (phase === "request") throw init!.signal!.reason;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(init!.signal!.reason);
          },
        }),
        { status: 400 },
      );
    });
    assert.equal(checked.readiness.lastCheck?.reason, "timeout");
    assert.equal(
      checked.readiness.lastCheck?.diagnostic?.source,
      "app_deadline",
    );
    assert.equal(checked.readiness.lastCheck?.diagnostic?.phase, phase);
    assert.equal(
      checked.readiness.lastCheck?.diagnostic?.httpStatus,
      phase === "response" ? 400 : undefined,
    );
    assert.doesNotMatch(
      JSON.stringify(checked),
      /private-deadline|private-timeout/,
    );
  }
  const gateway = await runAIConnectionCheck(
    { ...env, GEMINI_API_KEY: "private-gateway-at-deadline" },
    async () => new Response("private-gateway-body", { status: 504 }),
  );
  assert.equal(
    gateway.readiness.lastCheck?.diagnostic?.source,
    "provider_http",
  );
  assert.equal(gateway.readiness.lastCheck?.diagnostic?.httpStatus, 504);
});

test("connection details expose only allowlisted transport codes", async () => {
  for (const code of ["UND_ERR_CONNECT_TIMEOUT", "private-arbitrary-code"]) {
    const isolated = { ...env, GEMINI_API_KEY: `private-network-${code}-key` };
    const checked = await runAIConnectionCheck(isolated, async () => {
      throw Object.assign(new Error("private-error-with-url-and-key"), {
        cause: { code, privateValue: "private-cause" },
      });
    });
    assert.equal(checked.readiness.lastCheck?.diagnostic?.source, "transport");
    assert.equal(
      checked.readiness.lastCheck?.diagnostic?.networkCode,
      code === "UND_ERR_CONNECT_TIMEOUT" ? code : undefined,
    );
    assert.doesNotMatch(
      JSON.stringify(checked),
      /private-network|private-error|private-cause|private-arbitrary/,
    );
  }
});

test("connection details retain transport failures after response headers arrive", async () => {
  for (const status of [200, 400]) {
    const isolated = {
      ...env,
      GEMINI_API_KEY: `private-body-failure-${status}`,
    };
    const checked = await runAIConnectionCheck(
      isolated,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(
                Object.assign(new TypeError("private-body-error"), {
                  cause: {
                    code: "UND_ERR_BODY_TIMEOUT",
                    secret: "private-cause",
                  },
                }),
              );
            },
          }),
          { status },
        ),
    );
    assert.equal(checked.readiness.lastCheck?.diagnostic?.source, "transport");
    assert.equal(checked.readiness.lastCheck?.diagnostic?.phase, "response");
    assert.equal(checked.readiness.lastCheck?.diagnostic?.httpStatus, status);
    assert.equal(
      checked.readiness.lastCheck?.diagnostic?.networkCode,
      "UND_ERR_BODY_TIMEOUT",
    );
    assert.notEqual(checked.readiness.lastCheck?.reason, "model");
    assert.doesNotMatch(JSON.stringify(checked), /private-body|private-cause/);
  }
});

test("a real interrupted response stays a transport failure even without an allowlisted code", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
    response.write('{"candidates":[');
    setTimeout(() => response.destroy(), 30);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const checked = await runAIConnectionCheck(
      { ...env, GEMINI_API_KEY: "private-interrupted-response-key" },
      // This is a local synthetic server, never an external provider request.
      (_url, init) => fetch(`http://127.0.0.1:${address.port}`, init),
    );
    assert.equal(checked.readiness.lastCheck?.diagnostic?.source, "transport");
    assert.equal(checked.readiness.lastCheck?.diagnostic?.phase, "response");
    assert.equal(checked.readiness.lastCheck?.diagnostic?.httpStatus, 200);
    assert.equal(
      checked.readiness.lastCheck?.diagnostic?.networkCode,
      undefined,
    );
    assert.doesNotMatch(
      JSON.stringify(checked),
      /private-interrupted|candidates/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("a later failed check replaces a previous success for the same key", async () => {
  const same = { ...env, GEMINI_API_KEY: "private-same-key-recheck" };
  await runAIConnectionCheck(same, async () => good());
  assert.equal((await getAIReadiness(same)).lastCheck?.ok, true);
  // End this local test's reservation without waiting for the cooldown.
  await db.query(
    "UPDATE settings SET value=jsonb_set(value,'{nextCheckAt}','0'::jsonb) WHERE key='ai:connection-check'",
  );
  const failed = await runAIConnectionCheck(
    same,
    async () => new Response("private quota body", { status: 429 }),
  );
  assert.equal(failed.readiness.lastCheck?.ok, false);
  assert.equal((await getAIReadiness(same)).lastCheck?.reason, "quota");
});

test("connection-check endpoint rejects untrusted origins and requests without admin context", async () => {
  const original = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://receptionist.example.test";
  try {
    for (const origin of [
      "https://attacker.example.test",
      "https://receptionist.example.test",
    ]) {
      const response = await POST(
        new Request("https://receptionist.example.test/api/ai/check", {
          method: "POST",
          headers: { origin },
        }),
      );
      assert.equal(response.status, 403);
      assert.ok(
        !JSON.stringify(await response.json()).includes(env.GEMINI_API_KEY),
      );
    }
  } finally {
    if (original === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = original;
  }
});
