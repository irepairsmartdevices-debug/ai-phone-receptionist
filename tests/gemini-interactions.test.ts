import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAIConnection,
  createAssistantProviders,
} from "../src/providers/assistant";
import { traceConnectionCheck } from "../src/providers/connection-diagnostics";

const env = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "private-interactions-test-key",
};
const answers = [
  {
    id: "water",
    question: "Water damage?",
    topic: "Water damage",
    variations: [],
    answer: "PRIVATE-OWNER-ANSWER",
  },
];
const input = {
  text: "My Pixel 9 got wet yesterday. alice@example.com code 123456",
  memory: {
    history: [
      {
        role: "user" as const,
        text: "PRIVATE-TICKET-HISTORY",
        provenance: "private",
      },
    ],
  } as any,
  answers,
  catalog: [
    {
      id: "pixel-screen",
      category: "phone",
      brand: "Google",
      model: "Pixel 9",
      repair: "Screen",
    },
  ],
};
const plan = {
  action: "ask_details",
  device: "phone",
  model: "Pixel 9",
  issue: "liquid damage",
  answerIds: ["water"],
  question: null,
  ack: "none",
  nextGoal: "symptoms",
  style: "contextual",
  catalogOfferingId: "pixel-screen",
};
// Raw REST fixture: output_text is an SDK convenience and is absent here.
const interaction = (value: unknown) => ({
  id: "synthetic-interaction",
  status: "completed",
  model: "gemini-3.8-flash",
  steps: [
    {
      type: "thought",
      signature: "private-thought",
      summary: [{ type: "text", text: "Not output JSON" }],
    },
    {
      type: "model_output",
      content: [{ type: "text", text: JSON.stringify(value) }],
    },
  ],
});

test("default Gemini check succeeds against the exported Interactions API contract", async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const checked = await checkAIConnection(env, async (url, init) => {
    requests.push({ url: String(url), init });
    return String(url) ===
      "https://generativelanguage.googleapis.com/v1beta/interactions"
      ? Response.json(interaction({ ok: true }))
      : Response.json(
          { error: { status: "INVALID_ARGUMENT" } },
          { status: 400 },
        );
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.model, "gemini-3.8-flash");
  assert.equal(requests.length, 1);
  const { init } = requests[0];
  assert.equal(init?.method, "POST");
  assert.equal(init?.redirect, "error");
  assert.ok(init?.signal);
  assert.equal(
    new Headers(init?.headers).get("x-goog-api-key"),
    env.GEMINI_API_KEY,
  );
  const body = JSON.parse(String(init?.body));
  assert.equal(body.model, "gemini-3.8-flash");
  assert.equal(body.input, '{"check":"connection"}');
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.background, false);
  assert.equal(body.generation_config.thinking_level, "medium");
  assert.equal(body.generation_config.max_output_tokens, 512);
  assert.equal(body.generation_config.temperature, undefined);
  assert.equal(body.response_format.type, "text");
  assert.equal(body.response_format.mime_type, "application/json");
  assert.equal(body.response_format.schema.properties.ok.type, "boolean");
  assert.equal(body.previous_interaction_id, undefined);
  assert.equal(body.tools, undefined);
  assert.doesNotMatch(
    JSON.stringify(body),
    /customer|private-interactions-test-key/,
  );
});

test("Interactions planning preserves public context, ignores thoughts and shares one request with matching", async () => {
  let calls = 0;
  let sent = "";
  const providers = createAssistantProviders(env, async (_url, init) => {
    calls++;
    sent = String(init?.body);
    return Response.json(interaction(plan));
  });
  const [result, answerId] = await Promise.all([
    providers.planner(input),
    providers.answerMatcher(input.text, answers),
  ]);
  assert.deepEqual(result, plan);
  assert.equal(answerId, "water");
  assert.equal(calls, 1);
  const body = JSON.parse(sent);
  assert.match(body.input, /Pixel 9|pixel-screen/);
  assert.doesNotMatch(
    sent,
    /alice@example.com|123456|PRIVATE-OWNER-ANSWER|PRIVATE-TICKET-HISTORY/,
  );
  assert.equal(body.generation_config.max_output_tokens, 2048);
  assert.ok(body.response_format.schema.properties.nextGoal);
});

test("Interactions rejects noncompleted, errored, tool, nontext and ambiguous output", async () => {
  const good = interaction(plan);
  const output = good.steps[1];
  for (const raw of [
    ...[
      "in_progress",
      "queued",
      "incomplete",
      "failed",
      "cancelled",
      "budget_exceeded",
      "requires_action",
      "requires_continuation",
      "unknown",
    ].map((status) => ({ ...good, status })),
    { ...good, status: undefined },
    {
      ...good,
      errors: [{ code: "internal", message: "private provider fault" }],
    },
    {
      ...good,
      steps: [
        { ...output, error: { code: 13, message: "private provider fault" } },
      ],
    },
    {
      ...good,
      steps: [{ type: "function_call", name: "cancel_ticket" }, output],
    },
    { ...good, steps: [{ type: "future_unknown_step" }, output] },
    {
      ...good,
      steps: [
        { type: "model_output", content: [{ type: "image", data: "private" }] },
      ],
    },
    { ...good, steps: [output, output] },
    { ...good, steps: [] },
    {
      ...good,
      steps: [
        { type: "model_output", content: [{ type: "text", text: "not JSON" }] },
      ],
    },
    {
      ...good,
      steps: [{ type: "model_output", content: [{ type: "text", text: "" }] }],
    },
    { output_text: JSON.stringify(plan), status: "completed" },
  ]) {
    assert.equal(
      await createAssistantProviders(env, async () =>
        Response.json(raw),
      ).planner(input),
      null,
    );
    const checked = await checkAIConnection(env, async () =>
      Response.json(raw),
    );
    assert.equal(checked.ok, false);
    assert.equal(checked.reason, "response");
  }
});

test("Interactions accepts nullable optional errors but rejects oversized raw responses", async () => {
  const valid = interaction({ ok: true });
  assert.equal(
    (
      await checkAIConnection(env, async () =>
        Response.json({
          ...valid,
          errors: null,
          steps: [
            {
              type: "model_output",
              error: null,
              content: [{ type: "text", text: '{"ok":true}' }],
            },
          ],
        }),
      )
    ).ok,
    true,
  );
  const oversized = { ...valid, privatePadding: "x".repeat(70_000) };
  const checked = await checkAIConnection(env, async () =>
    Response.json(oversized),
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, "response");
  assert.doesNotMatch(JSON.stringify(checked), /privatePadding|xxxx/);
});

test("Interactions output still requires approved IDs and the local strict plan schema", async () => {
  for (const value of [
    { ...plan, answerIds: ["invented"] },
    { ...plan, catalogOfferingId: "invented" },
    { ...plan, question: "The repair costs $10" },
    { ...plan, inventedPrice: 10 },
  ])
    assert.equal(
      await createAssistantProviders(env, async () =>
        Response.json(interaction(value)),
      ).planner(input),
      null,
    );
  assert.equal(
    (
      await checkAIConnection(env, async () =>
        Response.json(interaction({ ok: false })),
      )
    ).ok,
    false,
  );
});

test("Interactions keeps safe HTTP error diagnostics without retries or private data", async () => {
  let calls = 0;
  const checked = await traceConnectionCheck(env, async () => {
    calls++;
    return Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "private provider message thinking_level",
        },
      },
      { status: 400 },
    );
  });
  assert.equal(calls, 1);
  assert.equal(checked.result.reason, "model");
  assert.equal(checked.diagnostic?.httpStatus, 400);
  assert.equal(checked.diagnostic?.providerCode, "INVALID_ARGUMENT");
  assert.deepEqual(checked.diagnostic?.parameters, ["thinking_level"]);
  assert.doesNotMatch(
    JSON.stringify(checked),
    /private provider message|private-interactions-test-key/,
  );
});

test("Interactions retains longer health waits and short customer fallback", async () => {
  let calls = 0;
  const slow: typeof fetch = async (_url, init) => {
    calls++;
    const signal = init?.signal!;
    const body = JSON.parse(String(init?.body));
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 9000);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
    return Response.json(
      interaction(
        body.input === '{"check":"connection"}' ? { ok: true } : plan,
      ),
    );
  };
  const [checked, result] = await Promise.all([
    checkAIConnection(env, slow),
    createAssistantProviders(env, slow).planner(input),
  ]);
  assert.equal(checked.ok, true);
  assert.equal(result, null);
  assert.equal(calls, 2);
});
