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
