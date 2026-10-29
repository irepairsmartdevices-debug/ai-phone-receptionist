import test from "node:test";
import assert from "node:assert/strict";
import { traceConnectionCheck } from "../src/providers/connection-diagnostics";
import { responseFailure } from "../src/providers/config";
import { generateGeminiJSON } from "../src/providers/gemini";

const key = "AIza" + "A".repeat(35);
const env = { AI_PROVIDER: "gemini", GEMINI_API_KEY: key };
const errorBody = {
  error: {
    code: "https://provider.example/errors/service-unavailable",
    message: `Backend unavailable. Key ${key}; contact owner@example.com or +1 (212) 555-0199.`,
    metadata: { password: "private-metadata-never-display" },
  },
};

test("admin check reads Interactions string codes and redacts its selected key and contacts", async () => {
  let calls = 0;
  const checked = await traceConnectionCheck(env, async () => {
    calls++;
    return Response.json(errorBody, { status: 503 });
  });
  assert.equal(calls, 1);
  assert.equal(checked.result.reason, "unavailable");
  assert.equal(
    checked.diagnostic?.providerErrorCode,
    "https://provider.example/errors/service-unavailable",
  );
  assert.match(
    checked.diagnostic?.providerMessage ?? "",
    /Backend unavailable/,
  );
  assert.match(checked.diagnostic?.providerMessage ?? "", /\[redacted\]/);
  assert.doesNotMatch(
    JSON.stringify(checked),
    /AIza|owner@example|212|private-metadata/,
  );
});

test("customer provider errors never capture free-form error fields", async () => {
  const failure = await responseFailure(
    Response.json(errorBody, { status: 503 }),
  );
  assert.equal(failure.details?.providerMessage, undefined);
  assert.equal(failure.details?.providerErrorCode, undefined);
  let observed: any;
  await assert.rejects(
    generateGeminiJSON(key, "gemini-3.8-flash", "plan", {}, {}, async () =>
      Response.json(errorBody, { status: 503 }),
    ),
    (error) => {
      observed = error;
      return true;
    },
  );
  assert.equal(observed.details?.providerMessage, undefined);
});

test("redaction precedes truncation and removes URI credentials, query strings and control characters", async () => {
  const checked = await traceConnectionCheck(env, async () =>
    Response.json(
      {
        error: {
          code: `https://username:private-password@provider.example/errors/${key}?secret=private-query#private-fragment`,
          message: `Failed\u0000\u0007 ${"x".repeat(1180)} ${key} extra ${"z".repeat(3000)}`,
        },
      },
      { status: 503 },
    ),
  );
  const detail = checked.diagnostic!;
  assert.ok(detail.providerMessage!.length <= 1200);
  assert.ok(detail.providerErrorCode!.length <= 240);
  assert.doesNotMatch(
    JSON.stringify(detail),
    /AIza|private-password|private-query|private-fragment|username|\\u0000|\\u0007/,
  );
});

test("only documented error message and code are extracted, without serializing JSON metadata", async () => {
  const checked = await traceConnectionCheck(env, async () =>
    Response.json(
      {
        message: "private-top-level",
        secret: "private-top-level-secret",
        error: {
          code: "service_unavailable",
          message: "Upstream did not complete the request.",
          headers: { authorization: key },
          metadata: { message: "private-nested-message" },
        },
      },
      { status: 503 },
    ),
  );
  assert.equal(checked.diagnostic?.providerErrorCode, "service_unavailable");
  assert.equal(
    checked.diagnostic?.providerMessage,
    "Upstream did not complete the request.",
  );
  assert.doesNotMatch(JSON.stringify(checked), /private-|AIza|authorization/);
});
