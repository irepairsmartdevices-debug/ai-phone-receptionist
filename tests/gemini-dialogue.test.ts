import test from "node:test";
import assert from "node:assert/strict";
import { runAssistantTurn } from "../src/conversation/assistant";
import { FixtureRepairService } from "../src/repair/fixture";
import type {
  AssistantOptions,
  AssistantState,
  DialoguePlan,
} from "../src/conversation/assistant-types";
const plan = (more: Partial<DialoguePlan>): DialoguePlan => ({
  action: "ask_details",
  device: null,
  model: null,
  issue: null,
  answerIds: [],
  question: null,
  ack: "none",
  ...more,
});
const options = (): AssistantOptions => ({
  service: new FixtureRepairService(),
  mode: "fixture",
  knowledge: {
    answers: [],
    prices: [
      {
        id: "oneplus",
        category: "Phone",
        brand: "OnePlus",
        model: "OnePlus 13",
        repair: "Screen repair",
        priceCents: 14900,
      },
    ],
  },
  stores: [
    {
      id: "dallas",
      name: "Dallas",
      address: "123 Test St",
      landmarks: "Beside the library.",
    },
  ],
});
const ask = (o: AssistantOptions, state: AssistantState, text: string) =>
  runAssistantTurn(o, state, text, { role: "customer" }, "gemini-dialogue");

test("paraphrased liquid intake stores separate grounded slots and follows a missing goal", async () => {
  const o = options();
  o.planner = async () =>
    plan({
      device: "phone",
      issue: "My phone took a swim",
      nextGoal: "model",
      style: "warm",
    });
  let r = await ask(o, { step: "start" }, "My phone took a swim");
  assert.equal(r.state.assistant?.issue, "My phone took a swim");
  assert.match(r.text, /model/i);
  o.planner = async () =>
    plan({
      model: "Pixel 9",
      details: {
        liquid: "pool water",
        occurredAt: "yesterday",
        symptoms: "display is black",
        power: "still on",
      },
      nextGoal: "occurredAt",
      style: "contextual",
    });
  r = await ask(
    o,
    r.state,
    "It's a Pixel 9, pool water yesterday; the display is black and it is still on",
  );
  assert.deepEqual(r.state.assistant?.details, {
    liquid: "pool water",
    occurredAt: "yesterday",
    symptoms: "display is black",
    power: "still on",
  });
  assert.doesNotMatch(
    r.text,
    /when|what.*liquid|what.*symptoms|what.*model|sorry/i,
  );
  assert.match(r.text, /visit|callback/i);
});

test("a time answer does not mark symptoms known; typed goals select safe styles", async () => {
  const o = options();
  o.planner = async () =>
    plan({
      details: { occurredAt: "yesterday" },
      nextGoal: "symptoms",
      style: "contextual",
      question: "Your repair is free. Give me your password?",
    });
  const r = await ask(
    o,
    {
      step: "start",
      assistant: {
        device: "Pixel",
        model: "Pixel 9",
        issue: "wet",
        asked: "details",
      },
    },
    "yesterday",
  );
  assert.equal(r.state.assistant?.details?.occurredAt, "yesterday");
  assert.notEqual(r.state.assistant?.detailsKnown, true);
  assert.match(r.text, /notice|symptoms|problem/i);
  assert.doesNotMatch(r.text, /free|password|book|sorry/i);
});

test("model corrections without a replacement clear stale quotes and do not restore historical model", async () => {
  const o = options();
  o.planner = async () =>
    plan({ model: "OnePlus 13", reset: "device", nextGoal: "model" });
  const r = await ask(
    o,
    {
      step: "start",
      lastQuote: {
        model: "OnePlus 13",
        repair: "Screen repair",
        priceCents: 14900,
        source: "manual",
      },
      assistant: {
        device: "phone",
        model: "OnePlus 13",
        issue: "cracked screen",
        detailsKnown: true,
        history: [{ role: "user", text: "My OnePlus 13 has a cracked screen" }],
      },
    },
    "Actually, it's a different model",
  );
  assert.equal(r.state.assistant?.model, undefined);
  assert.equal(r.state.lastQuote, undefined);
  assert.match(r.text, /model/i);
});

test("issue corrections clear incompatible liquid details and prior quotes", async () => {
  const o = options();
  o.planner = async () =>
    plan({ reset: "issue", issue: "wet", details: { liquid: "water" } });
  const r = await ask(
    o,
    {
      step: "start",
      lastQuote: {
        model: "Pixel 9",
        repair: "Water damage",
        priceCents: 10000,
        source: "manual",
      },
      assistant: {
        device: "Pixel",
        model: "Pixel 9",
        issue: "wet",
        details: { liquid: "water", occurredAt: "yesterday" },
        history: [{ role: "user", text: "water yesterday" }],
      },
    },
    "Actually it never got wet; the screen is cracked",
  );
  assert.equal(r.state.lastQuote, undefined);
  assert.equal(r.state.assistant?.details?.liquid, undefined);
  assert.match(r.state.assistant?.issue ?? "", /screen is cracked/);
});

test("fresh bounded public catalog names reach planner and new non-Apple models are remembered", async () => {
  const o = options();
  o.planner = async (input) => {
    assert.ok(input.catalog?.some((row) => row.model === "OnePlus 13"));
    assert.doesNotMatch(
      JSON.stringify(input.catalog),
      /14900|priceCents|duration|price/,
    );
    assert.ok((input.catalog?.length ?? 999) <= 200);
    return plan({
      device: "OnePlus",
      model: "OnePlus 13",
      issue: "screen is cracked",
      nextGoal: "power",
      style: "warm",
    });
  };
  const r = await ask(o, { step: "start" }, "My OnePlus 13 screen is cracked");
  assert.equal(r.state.assistant?.model, "OnePlus 13");
  assert.match(r.text, /on|off|power/i);
});

test("semantic price requests use current authoritative amounts and repair context", async () => {
  const o = options();
  o.planner = async () =>
    plan({ action: "pricing", catalogOfferingId: "manual:oneplus" });
  const state: AssistantState = {
    step: "start",
    assistant: {
      device: "phone",
      model: "OnePlus 13",
      issue: "cracked screen",
    },
  };
  let r = await ask(o, state, "What would that run me?");
  assert.match(r.text, /149\.00/);
  o.knowledge.prices[0].priceCents = 17900;
  r = await ask(o, state, "What would that run me?");
  assert.match(r.text, /179\.00/);
});

test("semantic pricing cannot shorten an unknown variant to a selected catalog model", async () => {
  const o = options();
  o.planner = async () =>
    plan({
      action: "pricing",
      device: "OnePlus",
      model: "OnePlus 13",
      catalogOfferingId: "manual:oneplus",
    });
  const r = await ask(
    o,
    { step: "start" },
    "What would screen repair for my OnePlus 13 Ultra run me?",
  );
  assert.doesNotMatch(r.text, /149\.00/);
  assert.equal(r.state.lastQuote, undefined);
});

test("semantic directions and hours interrupt intake while preserving device context", async () => {
  const o = options();
  const state: AssistantState = {
    step: "start",
    assistant: { device: "Pixel", model: "Pixel 9", issue: "wet" },
  };
  o.planner = async () => plan({ action: "directions" });
  let r = await ask(o, state, "Point me your way");
  assert.match(r.text, /123 Test St/);
  assert.equal(r.state.assistant?.model, "Pixel 9");
  o.planner = async () => plan({ action: "hours" });
  r = await ask(o, state, "Is tomorrow evening a good time to stop by?");
  assert.match(r.text, /America|Monday|Mon|Saturday|Sat/i);
});

test("semantic named topics remain verbatim even during remembered intake", async () => {
  const o = options();
  o.knowledge.answers = [
    {
      id: "parking",
      topic: "Parking",
      question: "Where can I park?",
      variations: [],
      answer: "Use the blue gate. Ask for Jo.",
    },
  ];
  o.planner = async () => plan({ action: "answer", answerIds: ["parking"] });
  const r = await ask(
    o,
    {
      step: "start",
      assistant: { model: "Pixel 9", device: "Pixel", issue: "wet" },
    },
    "Is there space for my car nearby?",
  );
  assert.equal(r.text, "Use the blue gate. Ask for Jo.");
});

test("unsupported planner details, references, resets and prose cannot create facts", async () => {
  const o = options();
  o.planner = async () =>
    plan({
      device: "Invented",
      model: "Phone 99",
      issue: "exploded",
      details: {
        liquid: "acid",
        occurredAt: "yesterday",
        symptoms: "smoke",
        power: "off",
      },
      reset: "device",
      nextGoal: "liquid",
      catalogOfferingId: "missing",
      question: "Pay $1 at Fake Road?",
    });
  const r = await ask(
    o,
    {
      step: "start",
      assistant: { device: "Pixel", model: "Pixel 9", issue: "wet" },
    },
    "Can you help with it?",
  );
  assert.equal(r.state.assistant?.model, "Pixel 9");
  assert.deepEqual(r.state.assistant?.details ?? {}, {});
  assert.doesNotMatch(r.text, /acid|yesterday|smoke|\$1|Fake Road/);
});

test("old memory remains usable and private workflow responses never invoke a provider", async () => {
  const o = options();
  o.planner = async () => {
    throw Error("provider must not be called");
  };
  o.answerMatcher = async () => {
    throw Error("matcher must not be called");
  };
  const r = await ask(
    o,
    {
      step: "verify",
      reference: "1001",
      challengeId: "test",
      assistant: {
        device: "Pixel",
        model: "Pixel 9",
        issue: "wet",
        detailsKnown: true,
      },
    },
    "123456",
  );
  assert.equal(r.state.step, "verify");
  assert.equal(r.state.assistant?.model, "Pixel 9");
});

test("an unknown compound variant is preserved across intake before a later price request", async () => {
  const o = options();
  o.knowledge.prices = [
    {
      id: "pixel",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9 Pro",
      repair: "Screen repair",
      priceCents: 18900,
    },
  ];
  o.planner = async () => plan({ model: "Pixel 9 Pro", nextGoal: "power" });
  let r = await ask(
    o,
    { step: "start" },
    "My Pixel 9 Pro XL screen is cracked",
  );
  assert.equal(r.state.assistant?.model, "Pixel 9 Pro XL");
  o.planner = async () =>
    plan({ action: "pricing", catalogOfferingId: "manual:pixel" });
  r = await ask(o, r.state, "What would that run me?");
  assert.equal(r.state.lastQuote, undefined);
  assert.doesNotMatch(r.text, /189\.00/);
});

test("a private workflow cannot invoke providers even for apparent topic text", async () => {
  const o = options();
  let calls = 0;
  o.planner = async () => {
    calls++;
    return null;
  };
  o.answerMatcher = async () => {
    calls++;
    return null;
  };
  o.knowledge.answers = [
    {
      id: "topic",
      topic: "Parking",
      question: "Parking",
      variations: [],
      answer: "Use the blue gate.",
    },
  ];
  await ask(
    o,
    { step: "verify", reference: "1001", challengeId: "test" },
    "123456 Parking",
  );
  assert.equal(calls, 0);
});

test("grounded observational details support the customer's own liquid and symptom words", async () => {
  const o = options();
  o.planner = async () =>
    plan({
      issue: "spilled kombucha",
      details: {
        liquid: "kombucha",
        symptoms: "touch input has stopped responding",
        power: "it shut down",
      },
      nextGoal: "occurredAt",
    });
  const r = await ask(
    o,
    { step: "start" },
    "My Pixel 9 had spilled kombucha on it; touch input has stopped responding and it shut down",
  );
  assert.equal(r.state.assistant?.details?.liquid, "kombucha");
  assert.equal(
    r.state.assistant?.details?.symptoms,
    "touch input has stopped responding",
  );
  assert.equal(r.state.assistant?.details?.power, "it shut down");
  assert.match(r.text, /when/i);
});

test("completed private verification and legacy history never reach a later Gemini request", async () => {
  const { createAssistantProviders } = await import(
    "../src/providers/assistant"
  );
  const o = options();
  const originalTicket = o.service.ticket.bind(o.service);
  o.service.ticket = async (...args) => {
    const result = await originalTicket(...args);
    return result.ok
      ? {
          ok: true,
          value: {
            ...result.value,
            device: "PrivateCustomerDevice",
            service: "PrivateRepairService",
            location: "PrivateCollectionLocation",
          },
        }
      : result;
  };
  let r = await ask(o, { step: "start" }, "My Pixel 9 has a cracked screen");
  r = await ask(o, r.state, "ticket status");
  r = await ask(o, r.state, "1001");
  assert.equal(r.state.step, "verify");
  r = await ask(o, r.state, "PrivateVerificationUserText");
  r = await ask(o, r.state, "123456");
  assert.equal(r.state.step, "start");
  assert.match(r.text, /PrivateCustomerDevice/);
  const requestBodies: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    requestBodies.push(String(init?.body));
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: JSON.stringify(plan({ nextGoal: "power" })) }],
          },
        },
      ],
    });
  };
  const publicTurn = async (state: AssistantState) =>
    ask(
      {
        ...o,
        ...createAssistantProviders(
          { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" },
          fetcher,
        ),
      },
      state,
      "Can you help with my device?",
    );
  await publicTurn(r.state);
  assert.equal(requestBodies.length, 1);
  assert.doesNotMatch(
    requestBodies[0],
    /PrivateCustomerDevice|PrivateRepairService|PrivateCollectionLocation|PrivateVerificationUserText|Ticket 1001|123456/,
  );
  const publicInput = JSON.parse(
    JSON.parse(requestBodies[0]).contents[0].parts[0].text,
  );
  assert.ok(
    publicInput.memory.history.some(
      (entry: { text: string }) =>
        entry.text === "My Pixel 9 has a cracked screen",
    ),
  );
  await publicTurn({
    step: "start",
    assistant: {
      device: "Pixel",
      model: "Pixel 9",
      issue: "cracked screen",
      history: [
        { role: "assistant", text: "LegacyPrivateTicketPayload" },
        { role: "user", text: "LegacyPrivateUserText" },
      ],
    },
  });
  assert.equal(requestBodies.length, 2);
  assert.doesNotMatch(
    requestBodies[1],
    /LegacyPrivateTicketPayload|LegacyPrivateUserText/,
  );
  assert.match(requestBodies[1], /Pixel 9|cracked screen/);
});

test("a later price request cannot restore a rejected model from the earlier issue text", async () => {
  const o = options();
  o.knowledge.prices = [
    {
      id: "screen",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9",
      repair: "Screen repair",
      priceCents: 14900,
    },
  ];
  let r = await ask(o, { step: "start" }, "My Pixel 9 screen is cracked");
  r = await ask(o, r.state, "How much?");
  assert.match(r.text, /149\.00/);
  r = await ask(o, r.state, "Actually, it's a different model");
  assert.equal(r.state.assistant?.model, undefined);
  r = await ask(o, r.state, "How much?");
  assert.equal(r.state.lastQuote, undefined);
  assert.equal(r.state.assistant?.model, undefined);
  assert.doesNotMatch(r.text, /149\.00/);
});

test("a grounded issue correction discards old symptoms before a later semantic price request", async () => {
  const o = options();
  o.knowledge.prices = [
    {
      id: "screen",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9",
      repair: "Screen repair",
      priceCents: 14900,
    },
    {
      id: "battery",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9",
      repair: "Battery replacement",
      priceCents: 7900,
    },
  ];
  let r = await ask(o, { step: "start" }, "My Pixel 9 screen is cracked");
  r = await ask(o, r.state, "How much?");
  assert.match(r.text, /149\.00/);
  o.planner = async () => plan({ issue: "battery", reset: "issue" });
  r = await ask(o, r.state, "Actually, it's the battery");
  o.planner = async () => plan({ action: "pricing" });
  r = await ask(o, r.state, "What would that run me?");
  assert.doesNotMatch(r.text, /149\.00|Screen repair/);
  assert.match(r.text, /79\.00/);
});

test("unknown Fold and Lite variants cannot quote a catalog prefix on a later turn", async () => {
  for (const suffix of ["Fold", "Lite"]) {
    const o = options();
    o.knowledge.prices = [
      {
        id: "pixel",
        category: "Phone",
        brand: "Google",
        model: "Pixel 9 Pro",
        repair: "Screen repair",
        priceCents: 18900,
      },
    ];
    o.planner = async () =>
      plan({ model: `Pixel 9 Pro ${suffix}`, nextGoal: "power" });
    let r = await ask(
      o,
      { step: "start" },
      `My Pixel 9 Pro ${suffix} screen is cracked`,
    );
    assert.equal(r.state.assistant?.model, `Pixel 9 Pro ${suffix}`);
    o.planner = async () =>
      plan({ action: "pricing", catalogOfferingId: "manual:pixel" });
    r = await ask(o, r.state, "What would that run me?");
    assert.equal(r.state.lastQuote, undefined);
    assert.doesNotMatch(r.text, /189\.00/);
    // Direct deterministic pricing must also protect the same variant.
    r = await ask(
      o,
      { step: "start" },
      `How much for Pixel 9 Pro ${suffix} screen repair?`,
    );
    assert.equal(r.state.lastQuote, undefined);
    assert.doesNotMatch(r.text, /189\.00/);
  }
});

test("legacy history is omitted at the provider boundary while marked public history is usable", async () => {
  const { createAssistantProviders } = await import(
    "../src/providers/assistant"
  );
  let sent = "";
  const providers = createAssistantProviders(
    { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" },
    async (_url, init) => {
      sent = String(init?.body);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(plan({})) }] },
          },
        ],
      });
    },
  );
  await providers.planner({
    text: "Can you help?",
    memory: {
      device: "Pixel",
      model: "Pixel 9",
      history: [
        { role: "assistant", text: "LegacyPrivateTicketPayload" },
        { role: "user", text: "PublicObservationMarker", provenance: "public" },
      ],
    },
    answers: [],
  });
  assert.doesNotMatch(sent, /LegacyPrivateTicketPayload/);
  assert.match(sent, /PublicObservationMarker/);
});

test("exact model boundaries preserve punctuation and ordinary prose without choosing among comma-separated devices", async () => {
  const o = options();
  o.knowledge.prices = [
    {
      id: "nine",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9",
      repair: "Screen repair",
      priceCents: 14900,
    },
    {
      id: "eight",
      category: "Phone",
      brand: "Google",
      model: "Pixel 8",
      repair: "Screen repair",
      priceCents: 12900,
    },
  ];
  for (const text of [
    "How much screen repair for Pixel 9? I dropped it",
    "How much for Pixel 9, I cracked the screen",
    "How much for Pixel 9 screen repair please?",
  ]) {
    const r = await ask(o, { step: "start" }, text);
    assert.match(r.text, /149\.00/, text);
  }
  const ambiguous = await ask(
    o,
    { step: "start" },
    "How much for Pixel 9, Pixel 8 screen repair?",
  );
  assert.equal(ambiguous.state.lastQuote, undefined);
  assert.match(ambiguous.text, /one device|which exact model/i);
  assert.doesNotMatch(ambiguous.text, /129\.00|149\.00/);
});

test("a current catalog compound variant keeps its own price when its base model is also listed", async () => {
  const o = options();
  o.knowledge.prices = [
    {
      id: "base",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9 Pro",
      repair: "Screen repair",
      priceCents: 18900,
    },
    {
      id: "fold",
      category: "Phone",
      brand: "Google",
      model: "Pixel 9 Pro Fold",
      repair: "Screen repair",
      priceCents: 22900,
    },
  ];
  o.planner = async () => plan({ model: "Pixel 9 Pro", nextGoal: "power" });
  let r = await ask(
    o,
    { step: "start" },
    "My Pixel 9 Pro Fold screen is cracked",
  );
  assert.equal(r.state.assistant?.model, "Pixel 9 Pro Fold");
  o.planner = async () =>
    plan({ action: "pricing", catalogOfferingId: "manual:base" });
  r = await ask(o, r.state, "What would that run me?");
  assert.match(r.text, /229\.00/);
  assert.doesNotMatch(r.text, /189\.00/);
});

for (const description of ["died yesterday", "accidentally fell in water"]) {
  test(`ordinary intake prose '${description}' keeps a known model for the next battery quote`, async () => {
    const o = options();
    o.knowledge.prices = [
      {
        id: "pixel-battery",
        category: "Phone",
        brand: "Google",
        model: "Pixel 9",
        repair: "Battery replacement",
        priceCents: 6900,
      },
    ];
    o.planner = async () =>
      plan({
        device: "Pixel",
        model: "Pixel 9",
        issue: description,
        nextGoal: "power",
      });
    let r = await ask(o, { step: "start" }, `My Pixel 9 ${description}`);
    assert.equal(r.state.assistant?.model, "Pixel 9");
    r = await ask(o, r.state, "How much for battery replacement?");
    assert.match(r.text, /69\.00/);
    assert.equal(r.state.lastQuote?.model, "Pixel 9");
  });
}
