import test from "node:test";
import assert from "node:assert/strict";
import { traceConnectionCheck } from "../src/providers/connection-diagnostics";

const env = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "private-service-error-key",
};
const highDemand =
  "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";

test("503 retains Google's known high-demand notice without exposing its error body", async () => {
  let calls = 0;
  const checked = await traceConnectionCheck(env, async () => {
    calls++;
    return Response.json(
      {
        error: {
          code: 503,
          status: "UNAVAILABLE",
          message: highDemand + " private-error-content",
          details: [
            {
              reason: "private-unknown-reason",
              metadata: { key: env.GEMINI_API_KEY },
            },
          ],
        },
      },
      { status: 503 },
    );
  });
  assert.equal(calls, 1);
  assert.equal(checked.result.reason, "unavailable");
  assert.equal(checked.diagnostic?.httpStatus, 503);
  assert.equal(checked.diagnostic?.providerCode, "UNAVAILABLE");
  assert.equal(checked.diagnostic?.providerNotice, "high_demand");
  assert.equal(checked.diagnostic?.providerContentType, "json");
  assert.equal(checked.diagnostic?.providerReason, undefined);
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private-|Spikes|metadata|message/,
  );
});

test("503 preserves ErrorInfo separately and does not apply the 400 authentication override", async () => {
  for (const reason of ["MODEL_OVERLOADED", "API_KEY_INVALID"]) {
    const checked = await traceConnectionCheck(env, async () =>
      Response.json(
        {
          error: {
            status: "UNAVAILABLE",
            message: "private-message",
            details: [{ reason, metadata: { private: "private-value" } }],
          },
        },
        { status: 503 },
      ),
    );
    assert.equal(checked.result.reason, "unavailable");
    assert.equal(checked.diagnostic?.providerReason, reason);
    assert.equal(checked.diagnostic?.providerNotice, undefined);
    assert.doesNotMatch(JSON.stringify(checked), /private-/);
  }
});

test("503 unrelated demand words and negated phrases do not invent a capacity notice", async () => {
  for (const message of [
    "Service unavailable",
    "private text high demand",
    "This model is not experiencing high demand.",
  ]) {
    const checked = await traceConnectionCheck(env, async () =>
      Response.json(
        { error: { status: "UNAVAILABLE", message } },
        { status: 503 },
      ),
    );
    assert.equal(checked.diagnostic?.providerNotice, undefined);
    assert.equal(checked.diagnostic?.providerCode, "UNAVAILABLE");
  }
});

test("malformed, oversized and non-JSON 503 errors keep the status without leaking body data", async () => {
  for (const [body, type, wanted] of [
    ["private-text", "text/plain", "text"],
    ["<html>private-html</html>", "text/html", "html"],
    ["private-malformed-json", "application/json", "json"],
    [
      JSON.stringify({ private: "x".repeat(70_000) }),
      "application/json",
      "json",
    ],
  ]) {
    let calls = 0;
    const checked = await traceConnectionCheck(env, async () => {
      calls++;
      return new Response(body, {
        status: 503,
        headers: { "content-type": type },
      });
    });
    assert.equal(calls, 1);
    assert.equal(checked.result.reason, "unavailable");
    assert.equal(checked.diagnostic?.source, "provider_http");
    assert.equal(checked.diagnostic?.httpStatus, 503);
    assert.equal(checked.diagnostic?.providerContentType, wanted);
    assert.doesNotMatch(JSON.stringify(checked), /private-|xxxx/);
  }
});

test("an interrupted 503 body keeps received headers and safe transport evidence", async () => {
  const failure = new Error("private-body-failure", {
    cause: { code: "UND_ERR_BODY_TIMEOUT" },
  });
  const checked = await traceConnectionCheck(
    env,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(failure);
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
  );
  assert.equal(checked.diagnostic?.phase, "response");
  assert.equal(checked.diagnostic?.httpStatus, 503);
  assert.equal(checked.diagnostic?.source, "transport");
  assert.equal(checked.diagnostic?.networkCode, "UND_ERR_BODY_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(checked), /private-/);
});

test("503 error-body reading respects the existing request deadline", async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", () => timeout(25));
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const checked = await traceConnectionCheck(
      env,
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init!.signal!.addEventListener(
                "abort",
                () => controller.error(init!.signal!.reason),
                { once: true },
              );
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    );
    assert.equal(checked.result.reason, "timeout");
    assert.equal(checked.diagnostic?.source, "app_deadline");
    assert.equal(checked.diagnostic?.phase, "response");
    assert.equal(checked.diagnostic?.httpStatus, 503);
  } finally {
    clearTimeout(keepAlive);
  }
});
