import test, { before, after } from "node:test";
import assert from "node:assert/strict";
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
