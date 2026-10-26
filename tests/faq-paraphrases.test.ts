import test from "node:test";
import assert from "node:assert/strict";
import { matchSavedAnswer } from "../src/knowledge/resolve";
import { ConversationEngine } from "../src/conversation/engine";
import { FixtureRepairService } from "../src/repair/fixture";
const entry = {
  id: "water-repair",
  question: "Do you repair water-damaged phones?",
  variations: ["My phone got wet", "Can you fix liquid damage?"],
  answer: "Yes, we repair water-damaged devices.",
};
test("saved water damage FAQ matches the customer screenshot wording without an AI key", async () => {
  const input = "do you fix water damage devices";
  assert.equal(matchSavedAnswer(input, [entry]).answer?.id, entry.id);
  const reply = await new ConversationEngine(
    new FixtureRepairService(),
    "fixture",
    undefined,
    { answers: [entry], prices: [] },
  ).turn({ step: "start" }, input, { role: "customer" }, "faq-regression");
  assert.equal(reply.text, entry.answer);
});
test("common repair synonyms and simple damage plurals resolve to the approved answer", () => {
  for (const input of [
    "Do you fix water-damaged phones?",
    "Can you repair liquid damaged devices?",
    "do you fix water damage devices",
    "Do you fix water damages on phones?",
  ]) {
    assert.equal(matchSavedAnswer(input, [entry]).answer?.id, entry.id, input);
  }
});
test("paraphrase matching does not cross device, repair, negation or policy boundaries", () => {
  for (const input of [
    "Do you fix water damage laptops?",
    "Do you fix water damage phones/laptops?",
    "Do you repair water damaged phone tablet?",
    "Do you not repair water damaged phones?",
    "Do you buy water damaged phones?",
    "What warranty do you have for water damaged phones?",
    "Do you repair screen damaged phones?",
  ]) {
    assert.equal(matchSavedAnswer(input, [entry]).answer, undefined, input);
  }
  const specific = {
    ...entry,
    question: "Do you repair water damage iPhone 14 Pro?",
    variations: [],
  };
  assert.equal(
    matchSavedAnswer("Do you repair water damage iPhone 15 Pro?", [specific])
      .answer,
    undefined,
  );
});
test("generic device wording asks for clarification when different device-specific FAQs match", () => {
  const tablet = {
    ...entry,
    id: "tablet",
    question: "Do you repair water-damaged tablets?",
    variations: [],
    answer: "Tablet-specific policy.",
  };
  assert.equal(
    matchSavedAnswer("do you fix water damage devices", [entry, tablet])
      .ambiguous,
    true,
  );
  const specific = {
    ...entry,
    question: "Do you repair water damage iPhone 14 Pro?",
    variations: [],
  };
  assert.equal(
    matchSavedAnswer("Do you repair water damage iPhone 14 Pro Max?", [
      specific,
    ]).answer,
    undefined,
  );
});
test("canonical cellphone aliases retain their phone-only scope", () => {
  const cell = {
    ...entry,
    question: "Do you repair water damaged cellphones?",
    variations: [],
  };
  assert.equal(
    matchSavedAnswer("Do you fix water damage laptops?", [cell]).answer,
    undefined,
  );
  assert.equal(
    matchSavedAnswer("Do you fix water damage phones?", [cell]).answer?.id,
    entry.id,
  );
});
