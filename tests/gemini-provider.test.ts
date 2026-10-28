import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAIConnection,
  createAssistantProviders,
  getAIStatus,
} from "../src/providers/assistant";

const env = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: "google-test-key",
  AI_PROVIDER_KEY: "openai-test-key",
};
const answers = [
  {
    id: "water",
    topic: "Water damage",
    question: "Do you repair water damage?",
    variations: ["My phone got wet"],
    answer: "Bring it in for inspection.",
  },
];
const catalog = [
  {
    id: "pixel-screen",
    category: "phone",
    brand: "Google",
    model: "Pixel 9",
    repair: "Screen",
  },
];
const input = {
  text: "My Pixel 9 took a swim yesterday",
  memory: {},
  answers,
  catalog,
};
const plan = {
  action: "ask_details",
  device: "phone",
  model: "Pixel 9",
  issue: "liquid damage",
  answerIds: ["water"],
  question: null,
  ack: "none",
  details: {
    liquid: null,
    occurredAt: "yesterday",
    symptoms: null,
    power: null,
  },
  nextGoal: "symptoms",
  style: "contextual",
  catalogOfferingId: "pixel-screen",
  reset: null,
};
const gemini = (value: unknown, extra: object = {}) =>
  Response.json({
    candidates: [
      {
        content: { role: "model", parts: [{ text: JSON.stringify(value) }] },
        finishReason: "STOP",
      },
    ],
    ...extra,
  });

test("selection preserves legacy OpenAI and isolates selected Gemini credentials", async () => {
  assert.deepEqual(getAIStatus({ AI_PROVIDER_KEY: "legacy" }), {
    provider: "openai",
    model: "gpt-4.1-mini",
    configured: true,
  });
  assert.deepEqual(getAIStatus(env), {
    provider: "gemini",
    model: "gemini-3.8-flash",
    configured: true,
  });
  assert.deepEqual(
    getAIStatus({ ...env, GEMINI_MODEL: "gemini-custom-preview" }),
    { provider: "gemini", model: "gemini-custom-preview", configured: true },
  );
  assert.deepEqual(
    getAIStatus({ AI_PROVIDER: "gemini", AI_PROVIDER_KEY: "legacy" }),
    {
      provider: "gemini",
      model: "gemini-3.8-flash",
      configured: false,
      reason: "missing_key",
    },
  );
  assert.equal(
    getAIStatus({ AI_PROVIDER: "openai", GEMINI_API_KEY: "google" }).configured,
    false,
  );
});

test("disabled, unknown and unsafe model configuration make no network requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return gemini(plan);
  };
  for (const settings of [
    { AI_PROVIDER: "none", ...{ GEMINI_API_KEY: "google" } },
    { AI_PROVIDER: "unknown", GEMINI_API_KEY: "google" },
    { ...env, GEMINI_MODEL: "../bad?key=secret" },
    { AI_PROVIDER: "gemini", AI_PROVIDER_KEY: "legacy" },
  ]) {
    const providers = createAssistantProviders(settings, fetcher);
    assert.equal(await providers.planner(input), null);
    assert.equal(await providers.answerMatcher(input.text, answers), null);
    assert.equal((await checkAIConnection(settings, fetcher)).ok, false);
  }
  assert.equal(getAIStatus({ AI_PROVIDER: "unknown" }).reason, "configuration");
  assert.equal(getAIStatus({ AI_PROVIDER: "none" }).provider, "none");
  assert.equal(calls, 0);
});

test("Gemini uses generateContent header auth and validates structured extraction", async () => {
  const providers = createAssistantProviders(
    { ...env, GEMINI_MODEL: "gemini-custom-preview" },
    async (url, init) => {
      assert.equal(
        String(url),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-custom-preview:generateContent",
      );
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-goog-api-key"), "google-test-key");
      assert.equal(headers.get("authorization"), null);
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.ok(body.generationConfig.responseJsonSchema.properties.nextGoal);
      assert.ok(body.generationConfig.maxOutputTokens <= 2048);
      assert.match(JSON.stringify(body.contents), /Pixel 9/);
      assert.match(JSON.stringify(body.contents), /pixel-screen/);
      return gemini(plan);
    },
  );
  assert.deepEqual(await providers.planner(input), plan);
});

test("planner and matcher share a single in-flight request and approved answer selection", async () => {
  let calls = 0;
  const providers = createAssistantProviders(env, async () => {
    calls++;
    return gemini(plan);
  });
  const [result, answerId] = await Promise.all([
    providers.planner(input),
    providers.answerMatcher(input.text, answers),
  ]);
  assert.deepEqual(result, plan);
  assert.equal(answerId, "water");
  assert.equal(
    await providers.answerMatcher("a different question", answers),
    null,
  );
  assert.equal(calls, 1);
});

test("matcher-first calls also consume one request and use only unambiguous approved IDs", async () => {
  let calls = 0;
  const providers = createAssistantProviders(env, async () => {
    calls++;
    return gemini({ ...plan, catalogOfferingId: null });
  });
  assert.equal(await providers.answerMatcher(input.text, answers), "water");
  assert.equal(await providers.planner(input), null);
  assert.equal(calls, 1);
  const ambiguous = createAssistantProviders(env, async () =>
    gemini({
      ...plan,
      answerIds: ["water", "second"],
      catalogOfferingId: null,
    }),
  );
  assert.equal(
    await ambiguous.answerMatcher("water?", [
      ...answers,
      { ...answers[0], id: "second" },
    ]),
    null,
  );
});

test("invalid IDs, freeform questions, extensions and extra factual fields fail closed", async () => {
  for (const value of [
    { ...plan, answerIds: ["invented"] },
    { ...plan, catalogOfferingId: "stale-catalog" },
    { ...plan, nextGoal: "diagnose" },
    { ...plan, style: "make_up_price" },
    { ...plan, details: { diagnosis: "fixed" } },
    { ...plan, question: "Your repair costs $10" },
    { ...plan, inventedPrice: 10 },
    { ...plan, reset: "authorization" },
    { ...plan, answerIds: ["water", "water"] },
  ])
    assert.equal(
      await createAssistantProviders(env, async () => gemini(value)).planner(
        input,
      ),
      null,
    );
});

test("STOP extraction excludes thought parts and rejects blocked, truncated and malformed responses", async () => {
  const thought = createAssistantProviders(env, async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            role: "model",
            parts: [
              { thought: true, text: "private thought not JSON" },
              { text: JSON.stringify(plan) },
            ],
          },
        },
      ],
    }),
  );
  assert.deepEqual(await thought.planner(input), plan);
  for (const raw of [
    {
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: JSON.stringify(plan) }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: "SAFETY",
          content: { parts: [{ text: JSON.stringify(plan) }] },
        },
      ],
    },
    { candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ thought: true, text: JSON.stringify(plan) }] },
        },
      ],
    },
    {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } },
      ],
    },
    { candidates: [], promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(plan) }] },
        },
      ],
      promptFeedback: { blockReason: "OTHER" },
    },
  ])
    assert.equal(
      await createAssistantProviders(env, async () =>
        Response.json(raw),
      ).planner(input),
      null,
    );
});

test("provider sends bounded public context with customer contacts, codes and private fields removed", async () => {
  let sent = "";
  const providers = createAssistantProviders(env, async (_url, init) => {
    sent = String(init?.body);
    return gemini({ ...plan, answerIds: [], catalogOfferingId: null });
  });
  await providers.planner({
    text:
      "My Pixel 9 got wet. Email alice@example.com call +1 (212) 555-0199 code 123456 password=hunter2 " +
      "x".repeat(10000),
    memory: {
      device: "phone",
      history: [
        {
          role: "user",
          text: "alice@example.com 123456",
          provenance: "public",
        },
      ],
      customerPhone: "PRIVATE-PHONE",
      verificationCode: "PRIVATE-CODE",
    } as any,
    answers: [],
    catalog: [],
  });
  assert.doesNotMatch(
    sent,
    /alice@example\.com|212\) 555-0199|123456|hunter2|PRIVATE-PHONE|PRIVATE-CODE/,
  );
  assert.match(sent, /Pixel 9/);
  assert.ok(sent.length < 18000);
});

test("legacy OpenAI factory uses its selected key and retains structured planner behavior", async () => {
  let calls = 0;
  const legacy = {
    action: "ask_device",
    device: null,
    model: null,
    issue: null,
    answerIds: [],
    question: "Which device do you have?",
    ack: "none",
  };
  const providers = createAssistantProviders(
    { AI_PROVIDER_KEY: "legacy-key", GEMINI_API_KEY: "ignored" },
    async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer legacy-key",
      );
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), null);
      return Response.json({
        choices: [
          {
            message: { content: JSON.stringify(legacy) },
            finish_reason: "stop",
          },
        ],
      });
    },
  );
  assert.deepEqual(await providers.planner(input), legacy);
  assert.equal(await providers.answerMatcher(input.text, answers), null);
  assert.equal(calls, 1);
});

test("connection check uses a fixed small independent prompt and returns safe status", async () => {
  let calls = 0;
  const result = await checkAIConnection(env, async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(JSON.stringify(body).length < 2000);
    assert.doesNotMatch(JSON.stringify(body), /Pixel|customer|alice@example/);
    return gemini({ ok: true });
  });
  assert.deepEqual(result, {
    provider: "gemini",
    model: "gemini-3.8-flash",
    configured: true,
    ok: true,
  });
  assert.equal(calls, 1);
});

test("the Gemini check uses the documented JSON-schema enum types", async () => {
  const result = await checkAIConnection(env, async (_url, init) => {
    const schema = JSON.parse(String(init?.body)).generationConfig
      .responseJsonSchema;
    // The Gemini API documents enum support for string and number schemas.
    if (schema.properties.ok.enum && schema.properties.ok.type === "boolean")
      return Response.json(
        { error: { status: "INVALID_ARGUMENT" } },
        { status: 400 },
      );
    return gemini({ ok: true });
  });
  assert.equal(result.ok, true);
});

test("a slow Gemini check can succeed without extending the live conversation wait", async () => {
  const settings = { ...env, GEMINI_MODEL: "gemini-flash-latest" };
  let calls = 0;
  const slowProvider: typeof fetch = async (_url, init) => {
    calls++;
    const isCheck =
      JSON.parse(String(init?.body)).contents[0].parts[0].text ===
      '{"check":"connection"}';
    const signal = init?.signal;
    assert.ok(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 9_000);
      function abort() {
        clearTimeout(timer);
        reject(signal!.reason);
      }
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
    return gemini(isCheck ? { ok: true } : plan);
  };
  const providers = createAssistantProviders(settings, slowProvider);
  const [check, conversation] = await Promise.all([
    checkAIConnection(settings, slowProvider),
    providers.planner(input),
  ]);
  assert.equal(
    check.ok,
    true,
    "the admin check must allow a response after eight seconds",
  );
  assert.equal(
    conversation,
    null,
    "a live conversation must keep its short fallback deadline",
  );
  assert.equal(
    calls,
    2,
    "each independent operation must send only one request",
  );
});

test("connection check safely classifies authentication, model, quota, timeout and response failures without retries", async () => {
  for (const [status, reason] of [
    [400, "model"],
    [401, "authentication"],
    [403, "authentication"],
    [404, "model"],
    [429, "quota"],
    [503, "unavailable"],
  ] as const) {
    let calls = 0;
    const result = await checkAIConnection(env, async () => {
      calls++;
      return new Response("google-test-key sensitive body", { status });
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.doesNotMatch(JSON.stringify(result), /google-test-key|sensitive/);
    assert.equal(calls, 1);
  }
  assert.equal(
    (
      await checkAIConnection(env, async () => {
        throw new DOMException("private", "TimeoutError");
      })
    ).reason,
    "timeout",
  );
  assert.equal(
    (
      await checkAIConnection(env, async () => {
        throw Error("private failure");
      })
    ).reason,
    "unavailable",
  );
  for (const bad of [{ ok: false }, { ok: true, extra: "private" }, plan])
    assert.equal(
      (await checkAIConnection(env, async () => gemini(bad))).reason,
      "response",
    );
});

test("a failed selected Gemini request never falls back to OpenAI or repeats", async () => {
  const urls: string[] = [];
  const providers = createAssistantProviders(env, async (url) => {
    urls.push(String(url));
    return new Response("quota", { status: 429 });
  });
  assert.equal(await providers.planner(input), null);
  assert.equal(await providers.answerMatcher(input.text, answers), null);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /generativelanguage\.googleapis\.com/);
});

test("Google invalid API keys reported as HTTP 400 remain authentication failures", async () => {
  const result = await checkAIConnection(env, async () =>
    Response.json(
      {
        error: {
          code: 400,
          message: "API key not valid. google-test-key",
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "API_KEY_INVALID",
              domain: "googleapis.com",
            },
          ],
        },
      },
      { status: 400 },
    ),
  );
  assert.equal(result.reason, "authentication");
  assert.doesNotMatch(
    JSON.stringify(result),
    /google-test-key|API_KEY_INVALID/,
  );
});

test("malformed response envelopes and oversized outputs have the safe response failure category", async () => {
  for (const raw of [
    null,
    { candidates: "invalid" },
    {
      candidates: [
        {
          finishReason: "STOP",
          safetyRatings: {},
          content: { parts: [{ text: '{"ok":true}' }] },
        },
      ],
    },
    { candidates: [{ finishReason: "STOP", content: { parts: [null] } }] },
  ]) {
    assert.equal(
      (await checkAIConnection(env, async () => Response.json(raw))).reason,
      "response",
    );
  }
  assert.equal(
    (await checkAIConnection(env, async () => new Response("x".repeat(70000))))
      .reason,
    "response",
  );
});

test("OpenAI connection checks keep explicit selected-provider credentials and validate completion", async () => {
  let calls = 0;
  const settings = {
    AI_PROVIDER: "openai",
    AI_PROVIDER_KEY: "legacy",
    GEMINI_API_KEY: "unused-google",
  };
  const result = await checkAIConnection(settings, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer legacy",
    );
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), null);
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
    });
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(
    (
      await checkAIConnection(settings, async () =>
        Response.json({
          choices: [
            { finish_reason: "length", message: { content: '{"ok":true}' } },
          ],
        }),
      )
    ).reason,
    "response",
  );
});

test("short slot answers carry the previous question goal without leaking unrelated memory", async () => {
  let memory: any;
  const providers = createAssistantProviders(env, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    memory = JSON.parse(body.contents[0].parts[0].text).memory;
    return gemini({ ...plan, catalogOfferingId: null });
  });
  await providers.planner({
    text: "yesterday",
    memory: {
      askedGoal: "occurredAt",
      device: "phone",
      model: "Pixel 9",
      privateToken: "must-never-send",
    } as any,
    answers,
  });
  assert.equal(memory.askedGoal, "occurredAt");
  assert.equal(memory.privateToken, undefined);
});

test("canonical IDs are never truncated into invented approved or catalog references", async () => {
  const oversizedAnswer = { ...answers[0], id: "a".repeat(120) };
  assert.equal(
    await createAssistantProviders(env, async () =>
      gemini({
        ...plan,
        answerIds: ["a".repeat(100)],
        catalogOfferingId: null,
      }),
    ).planner({ ...input, answers: [oversizedAnswer] }),
    null,
  );
  const oversizedOffering = { ...catalog[0], id: "c".repeat(170) };
  assert.equal(
    await createAssistantProviders(env, async () =>
      gemini({ ...plan, catalogOfferingId: "c".repeat(100) }),
    ).planner({ ...input, catalog: [oversizedOffering] }),
    null,
  );
  const longOffering = { ...catalog[0], id: "valid-" + "c".repeat(140) };
  const valid = { ...plan, catalogOfferingId: longOffering.id };
  assert.deepEqual(
    await createAssistantProviders(env, async () => gemini(valid)).planner({
      ...input,
      catalog: [longOffering],
    }),
    valid,
  );
});

test("catalog and answer budgets reject references omitted from bounded public context", async () => {
  let body: any;
  const extraAnswers = Array.from({ length: 101 }, (_, index) => ({
    ...answers[0],
    id: `answer-${index}`,
  }));
  const extraCatalog = Array.from({ length: 301 }, (_, index) => ({
    ...catalog[0],
    id: `offering-${index}`,
    privatePrice: 999,
  }));
  const providers = createAssistantProviders(env, async (_url, init) => {
    body = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    return gemini({
      ...plan,
      answerIds: ["answer-100"],
      catalogOfferingId: "offering-300",
    });
  });
  assert.equal(
    await providers.planner({
      ...input,
      answers: extraAnswers,
      catalog: extraCatalog,
    }),
    null,
  );
  assert.ok(body.answers.length <= 100);
  assert.ok(body.catalog.length <= 300);
  assert.doesNotMatch(JSON.stringify(body), /privatePrice/);
});

test("Gemini 3 Flash bounds thinking for short plans and leaves custom model thinking settings alone", async () => {
  const bodies: any[] = [];
  const planner = createAssistantProviders(env, async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return gemini(plan);
  });
  assert.deepEqual(await planner.planner(input), plan);
  assert.equal(
    (
      await checkAIConnection(env, async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return gemini({ ok: true });
      })
    ).ok,
    true,
  );
  assert.equal(
    bodies[0].generationConfig.thinkingConfig?.thinkingLevel,
    "MINIMAL",
  );
  assert.equal(
    bodies[1].generationConfig.thinkingConfig?.thinkingLevel,
    "MINIMAL",
  );
  assert.ok(bodies[1].generationConfig.maxOutputTokens >= 256);
  assert.ok(bodies[1].generationConfig.maxOutputTokens <= 512);
  await checkAIConnection(
    { ...env, GEMINI_MODEL: "gemini-2.5-flash" },
    async (_url, init) => {
      assert.equal(
        JSON.parse(String(init?.body)).generationConfig.thinkingConfig,
        undefined,
      );
      return gemini({ ok: true });
    },
  );
});
