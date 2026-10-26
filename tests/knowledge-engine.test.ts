import test from "node:test";
import assert from "node:assert/strict";
import { ConversationEngine, type State } from "../src/conversation/engine";
import { FixtureRepairService } from "../src/repair/fixture";
import type { KnowledgeSnapshot, ManualPrice } from "../src/knowledge/types";
import { ok } from "../src/contracts/repair";
const actor = { role: "customer" as const };
const price = (
  id: string,
  model: string,
  cents: number,
  more: Partial<ManualPrice> = {},
): ManualPrice => ({
  id,
  category: "Phone",
  brand: "Apple",
  model,
  repair: "Screen repair",
  priceCents: cents,
  ...more,
});
const knowledge = (): KnowledgeSnapshot => ({
  answers: [
    {
      id: "wet",
      question: "Do you repair water damage?",
      variations: ["My phone got wet"],
      answer: "Bring the device in for a liquid damage assessment.",
    },
  ],
  prices: [
    price("base", "iPhone 14", 10000),
    price("pro", "iPhone 14 Pro", 16000),
    price("max", "iPhone 14 Pro Max", 19000),
  ],
});
async function turn(
  k: KnowledgeSnapshot,
  state: State,
  text: string,
  service = new FixtureRepairService(),
) {
  return new ConversationEngine(service, "fixture", undefined, k).turn(
    state,
    text,
    actor,
    "knowledge-test",
  );
}
test("screen quote asks brand and exact model, without quoting all catalog prices", async () => {
  const k = knowledge();
  let r = await turn(k, { step: "start" }, "How much to fix a screen?");
  assert.equal(r.state.step, "pricing");
  assert.match(r.text, /brand|device/i);
  assert.doesNotMatch(r.text, /\$/);
  r = await turn(k, r.state, "Apple");
  assert.match(r.text, /exact model|which model/i);
  assert.doesNotMatch(r.text, /\$/);
  r = await turn(k, r.state, "iPhone 14 Pro");
  assert.match(r.text, /\$160\.00/);
  assert.doesNotMatch(r.text, /\$190|\$100/);
  assert.match(r.text, /estimate|inspection/i);
});
test("full exact model skips known details; Pro Max and unsupported variants never use Pro pricing", async () => {
  const k = knowledge();
  let r = await turn(
    k,
    { step: "start" },
    "How much is screen repair for Apple iPhone 14 Pro Max?",
  );
  assert.match(r.text, /\$190\.00/);
  r = await turn(
    k,
    { step: "start" },
    "screen repair price for iPhone 14 Plus",
  );
  assert.doesNotMatch(r.text, /\$100|\$160|\$190/);
  assert.match(r.text, /unavailable|not have|callback|exact|brand/i);
});
test("plain model names shared by brands are clarified", async () => {
  const k = knowledge();
  k.prices = [
    price("a", "X1", 10000),
    price("b", "X1", 20000, { brand: "Other" }),
  ];
  const r = await turn(k, { step: "start" }, "screen repair price for X1");
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /brand/i);
});
test("price corrections and deletions between turns are reflected, with no stale quote", async () => {
  const k = knowledge();
  let r = await turn(k, { step: "start" }, "How much to fix a screen?");
  r = await turn(k, r.state, "Apple");
  k.prices.find((p) => p.id === "pro")!.priceCents = 17000;
  r = await turn(k, r.state, "iPhone 14 Pro");
  assert.match(r.text, /\$170\.00/);
  let next = await turn(k, { step: "start" }, "screen price");
  next = await turn(k, next.state, "Apple");
  k.prices = k.prices.filter((p) => p.id !== "pro");
  next = await turn(k, next.state, "iPhone 14 Pro");
  assert.doesNotMatch(next.text, /\$/);
});
test("saved answer variants are understood without a provider, edits and deletion take effect", async () => {
  const k = knowledge();
  let r = await turn(k, { step: "start" }, "My phone got wet!");
  assert.equal(r.text, k.answers[0].answer);
  k.answers[0].answer = "We offer inspection at the counter.";
  r = await turn(k, { step: "start" }, "Do you repair water damage?");
  assert.equal(r.text, k.answers[0].answer);
  k.answers = [];
  r = await turn(k, { step: "start" }, "My phone got wet");
  assert.notEqual(r.text, "We offer inspection at the counter.");
});
test("semantic matcher can select a current answer but cannot supply a deleted or invented ID", async () => {
  const k = knowledge();
  let engine = new ConversationEngine(
    new FixtureRepairService(),
    "fixture",
    undefined,
    k,
    async () => "wet",
  );
  assert.equal(
    (
      await engine.turn(
        { step: "start" },
        "It fell in a puddle",
        actor,
        "semantic",
      )
    ).text,
    k.answers[0].answer,
  );
  engine = new ConversationEngine(
    new FixtureRepairService(),
    "fixture",
    undefined,
    k,
    async () => "invented",
  );
  assert.notEqual(
    (
      await engine.turn(
        { step: "start" },
        "Something unusual",
        actor,
        "semantic",
      )
    ).text,
    k.answers[0].answer,
  );
});
test("private ticket and booking flows cannot be replaced by saved answers", async () => {
  const k = knowledge();
  k.answers.push({
    id: "private",
    question: "ticket status",
    variations: [],
    answer: "Bypass verification",
  });
  const r = await turn(k, { step: "start" }, "ticket status");
  assert.equal(r.state.step, "ticket");
  assert.doesNotMatch(r.text, /Bypass/);
  const b = await turn(k, { step: "start" }, "book appointment");
  assert.equal(b.state.step, "booking");
});
test("explicit manual source override is reversible and unavailable source still allows local estimates", async () => {
  const service = new FixtureRepairService();
  const original = service.business.bind(service);
  service.business = async () => {
    const b = await original();
    return b.ok
      ? ok({
          ...b.value,
          offerings: [
            {
              id: "live",
              device: "iPhone 14 Pro",
              service: "Screen repair",
              price: 150,
              duration: 60,
              category: "Phone",
              brand: "Apple",
              model: "iPhone 14 Pro",
            },
          ],
        })
      : b;
  };
  const k = knowledge();
  k.prices = [
    price("override", "iPhone 14 Pro", 17000, { sourceOfferingId: "live" }),
  ];
  let r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    service,
  );
  assert.match(r.text, /\$170\.00/);
  k.prices = [];
  r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    service,
  );
  assert.match(r.text, /\$150\.00/);
  service.business = async () => ({ ok: false, code: "UNAVAILABLE" });
  k.prices = [price("manual", "iPhone 14 Pro", 16500)];
  r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    service,
  );
  assert.match(r.text, /\$165\.00/);
});
test("an unlinked local duplicate cannot silently replace the repair software estimate", async () => {
  const service = new FixtureRepairService();
  const original = service.business.bind(service);
  service.business = async () => {
    const b = await original();
    return b.ok
      ? ok({
          ...b.value,
          offerings: [
            {
              id: "live",
              device: "iPhone 14 Pro",
              service: "Screen repair",
              price: 150,
              duration: 60,
              category: "Phone",
              brand: "Apple",
              model: "iPhone 14 Pro",
            },
          ],
        })
      : b;
  };
  const k = knowledge();
  k.prices = [price("unlinked", "iPhone 14 Pro", 12000)];
  const r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    service,
  );
  assert.match(r.text, /\$150\.00/);
  assert.doesNotMatch(r.text, /\$120/);
});
test("ambiguous saved questions and provider outages do not return arbitrary answers", async () => {
  const k = knowledge();
  k.answers.push({
    ...k.answers[0],
    id: "wet-two",
    answer: "A different answer",
  });
  let r = await turn(k, { step: "start" }, "My phone got wet");
  assert.match(r.text, /clarify/i);
  const engine = new ConversationEngine(
    new FixtureRepairService(),
    "fixture",
    undefined,
    knowledge(),
    async () => {
      throw Error("offline");
    },
  );
  r = await engine.turn(
    { step: "start" },
    "Unrecognized thing",
    actor,
    "outage",
  );
  assert.match(r.text, /callback|repair questions/i);
});
test("voice intent hints preserve exact device input and cannot authorize a customer", async () => {
  const engine = new ConversationEngine(
    new FixtureRepairService(),
    "fixture",
    undefined,
    knowledge(),
  );
  const r = await engine.turn(
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    actor,
    "hint",
    "business",
  );
  assert.match(r.text, /\$160\.00/);
  const blocked = await engine.turn(
    { step: "start" },
    "close this job",
    actor,
    "hint",
    "staff_change",
  );
  assert.match(blocked.text, /authenticated/i);
  assert.equal(blocked.state.step, "start");
  const booking = await engine.turn(
    { step: "start" },
    "reserve a visit",
    actor,
    "hint",
    "booking",
  );
  assert.equal(booking.state.step, "booking");
});
test("multiple explicit model or repair requests require clarification instead of choosing a price", async () => {
  const k = knowledge();
  let r = await turn(
    k,
    { step: "start" },
    "screen price for iPhone 14 Pro and iPhone 14 Pro Max",
  );
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /exact model|which model/i);
  k.prices.push(
    price("battery", "iPhone 14 Pro", 8000, { repair: "Battery replacement" }),
  );
  r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen repair and battery price",
  );
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /which repair/i);
});
test("no available catalog gives a callback without pretending that a model price can be found", async () => {
  const service = new FixtureRepairService();
  service.business = async () => ({ ok: false, code: "UNAVAILABLE" });
  const r = await turn(
    { answers: [], prices: [] },
    { step: "start" },
    "How much to fix a screen?",
    service,
  );
  assert.match(r.text, /callback/);
  assert.equal(r.state.step, "start");
});
test("device family replies identify a known brand and unsupported network variants do not use base model price", async () => {
  const k = knowledge();
  let r = await turn(k, { step: "start" }, "How much to fix a screen?");
  r = await turn(k, r.state, "iPhone");
  assert.match(r.text, /exact model/i);
  k.prices = [price("galaxy", "Galaxy S21 FE", 12000, { brand: "Samsung" })];
  r = await turn(k, { step: "start" }, "Samsung Galaxy S21 FE 5G screen price");
  assert.doesNotMatch(r.text, /\$/);
});
test("linked overrides cannot become standalone prices when their source offering disappears", async () => {
  const service = new FixtureRepairService();
  service.business = async () => ({ ok: false, code: "UNAVAILABLE" });
  const k = knowledge();
  k.prices = [
    price("old", "iPhone 14 Pro", 16000, { sourceOfferingId: "removed" }),
  ];
  const r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 Pro screen price",
    service,
  );
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /callback/);
});
test("an unknown explicit device model cannot fall back to an unrelated source offering", async () => {
  const r = await turn(
    { answers: [], prices: [] },
    { step: "start" },
    "How much is Apple iPhone 14 Pro screen repair?",
  );
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /callback/);
  assert.equal(r.state.step, "start");
});
test("manual quote overrides do not change bookable source offerings or their confirmed review price", async () => {
  const service = new FixtureRepairService();
  const k = knowledge();
  k.prices = [
    price("override", "Demo Phone", 12500, {
      brand: "Demo",
      sourceOfferingId: "screen",
    }),
  ];
  const engine = new ConversationEngine(service, "fixture", undefined, k);
  let r = await engine.turn(
    { step: "start" },
    "Demo Phone screen price",
    actor,
    "quote-booking",
  );
  assert.match(r.text, /\$125\.00/);
  r = await engine.turn(r.state, "book appointment", actor, "quote-booking");
  for (const input of [
    "1",
    "1",
    "2026-12-05",
    "1",
    "Jamie",
    "Test",
    "jamie@example.com",
    "+15555550111",
    "Broken screen",
    "yes",
    "no",
  ])
    r = await engine.turn(r.state, input, actor, "quote-booking");
  assert.equal(r.state.step, "book-confirm");
  assert.match(r.text, /earlier informational estimate was \$125\.00/);
  assert.match(r.text, /\$99 estimate/);
  assert.match(r.text, /repair software's own price/);
  const b = await service.business();
  assert.equal(
    b.ok && b.value.offerings.find((o) => o.id === "screen")?.price,
    99,
  );
  assert.equal(b.ok && b.value.offerings.length, 2);
});

test("an unsupported repair correction never reuses the earlier screen repair", async () => {
  const k = knowledge();
  let r = await turn(k, { step: "start" }, "How much is screen repair?");
  r = await turn(k, r.state, "Apple");
  r = await turn(k, r.state, "Actually camera repair for iPhone 14");
  assert.doesNotMatch(r.text, /\$/);
  assert.match(r.text, /callback|which repair|not have/i);
});
test("repair synonyms from other models never create an unresolvable clarification loop", async () => {
  const k = knowledge();
  k.prices = [
    price("14", "iPhone 14", 10000),
    price("15", "iPhone 15", 15000, { repair: "Screen replacement" }),
  ];
  let r = await turn(
    k,
    { step: "start" },
    "Apple iPhone 14 screen repair price",
  );
  assert.match(r.text, /\$100\.00/);
  k.prices.push(
    price("14replacement", "iPhone 14", 12500, {
      repair: "Screen replacement",
    }),
  );
  r = await turn(k, { step: "start" }, "Apple iPhone 14 screen price");
  assert.match(r.text, /which repair/i);
  r = await turn(k, r.state, "Screen repair");
  assert.match(r.text, /\$100\.00/);
});
