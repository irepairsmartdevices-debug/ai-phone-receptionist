import test from "node:test";
import assert from "node:assert/strict";
import { runAssistantTurn } from "../src/conversation/assistant";
import { FixtureRepairService } from "../src/repair/fixture";
import type { AssistantOptions, AssistantState } from "../src/conversation/assistant-types";
import type { CustomAnswer } from "../src/knowledge/types";

const locationTopic = (): CustomAnswer => ({
  id: "location-topic",
  topic: "Store Location",
  question: "Where is your store?",
  variations: ["I need directions", "Store location", "How do I find your shop?"],
  answer: "Come across from RedBird Mall, into the same complex as Hair Depot. Ask our shop to confirm the full address.",
});
const options = (): AssistantOptions => ({
  mode: "fixture",
  service: new FixtureRepairService(),
  knowledge: { answers: [locationTopic()], prices: [] },
  stores: [{ id: "dallas", name: "Dallas", address: "123 Test St", landmarks: "Built-in landmark." }],
});
const ask = (o: AssistantOptions, text: string, state: AssistantState = { step: "start" }) =>
  runAssistantTurn(o, state, text, { role: "customer" }, "call-topics-test");

test("every saved location-topic trigger uses the owner's custom answer ahead of built-in directions", async () => {
  const o = options();
  const topic = o.knowledge.answers[0];
  for (const phrase of [topic.question, ...topic.variations]) {
    const reply = await ask(o, phrase);
    assert.equal(reply.text, topic.answer);
    assert.doesNotMatch(reply.text, /123 Test St/);
  }
});

test("topic edits take effect on the next turn and deleted topics stop supplying their answer", async () => {
  const o = options();
  let reply = await ask(o, "I need directions");
  o.knowledge.answers[0].answer = "Please call our Dallas shop for our entrance instructions.";
  reply = await ask(o, "I need directions", JSON.parse(JSON.stringify(reply.state)));
  assert.equal(reply.text, o.knowledge.answers[0].answer);
  o.knowledge.answers = [];
  reply = await ask(o, "I need directions", reply.state);
  assert.match(reply.text, /123 Test St/);
  assert.doesNotMatch(reply.text, /entrance instructions/);
});

test("conflicting topic triggers ask for clarification instead of choosing a location response", async () => {
  const o = options();
  o.knowledge.answers.push({ ...locationTopic(), id: "other", topic: "Parking", answer: "An unrelated approved answer." });
  const reply = await ask(o, "I need directions");
  assert.match(reply.text, /clarify|more than one/i);
  assert.doesNotMatch(reply.text, /123 Test St|unrelated approved answer|Hair Depot/);
});

test("named-topic replies preserve repair context during ordinary intake", async () => {
  const o = options();
  let reply = await ask(o, "My iPhone 14 is wet");
  reply = await ask(o, "Where is your store?", reply.state);
  assert.equal(reply.text, locationTopic().answer);
  assert.equal(reply.state.assistant?.model, "iPhone 14");
  reply = await ask(o, "The screen is black", reply.state);
  assert.match(reply.text, /book a repair visit/);
});

test("saved topic triggers cannot consume verification codes, pricing fields or a real booking offer", async () => {
  const o = options();
  o.knowledge.answers[0].variations.push("123456", "yes", "Apple");
  let reply = await ask(o, "ticket status");
  reply = await ask(o, "1001", reply.state);
  assert.equal(reply.state.step, "verify");
  reply = await ask(o, "123456", reply.state);
  assert.match(reply.text, /Ticket 1001:/);
  assert.notEqual(reply.text, locationTopic().answer);
  reply = await ask(o, "Apple", { step: "pricing", pricing: { asked: "brand", repair: "Screen repair" } });
  assert.notEqual(reply.text, locationTopic().answer);
  reply = await ask(o, "yes", { step: "start", assistant: { offeredBooking: true } });
  assert.equal(reply.state.step, "booking");
});

test("AI matching may select an existing named location topic but cannot supply its own answer", async () => {
  const o = options();
  o.answerMatcher = async () => "location-topic";
  const reply = await ask(o, "Could you give me directions to the service entrance?");
  assert.equal(reply.text, locationTopic().answer);
  o.answerMatcher = async () => "made-up-id";
  assert.match((await ask(o, "Could you give me directions to the service entrance?")).text, /123 Test St/);
  o.answerMatcher = async () => { throw new Error("offline"); };
  assert.match((await ask(o, "Could you give me directions to the service entrance?")).text, /123 Test St/);
});

test("answering a named topic clears an earlier public store-choice prompt", async () => {
  for (const semantic of [false, true]) {
    const o = options();
    o.stores.push({ id: "north", name: "North", address: "456 Test Rd", landmarks: "" });
    let reply = await ask(o, "Can you give me directions?");
    assert.equal(reply.state.assistant?.choosingStore, true);
    if (semantic)
      o.answerMatcher = async (text) =>
        text === "Could you give me directions to the service entrance?"
          ? "location-topic"
          : null;
    reply = await ask(o, semantic ? "Could you give me directions to the service entrance?" : "Where is your store?", reply.state);
    assert.equal(reply.text, locationTopic().answer);
    assert.equal(reply.state.assistant?.choosingStore, false);
    reply = await ask(o, "What are your opening hours?", reply.state);
    assert.doesNotMatch(reply.text, /which store/i);
    assert.match(reply.text, /Mon|Sat|09:00/i);
  }
});

test("price and private-action questions retain their authoritative workflows despite named triggers", async () => {
  const o = options();
  o.knowledge.answers[0].variations.push("How much is screen repair?", "cancel ticket 1001");
  const quote = await ask(o, "How much is screen repair?");
  assert.notEqual(quote.text, locationTopic().answer);
  assert.match(quote.text, /model|brand|device/i);
  const change = await ask(o, "cancel ticket 1001");
  assert.match(change.text, /authenticated staff|verified tickets/i);
  assert.notEqual(change.text, locationTopic().answer);
});
