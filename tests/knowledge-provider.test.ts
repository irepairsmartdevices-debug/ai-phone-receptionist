import test from "node:test";
import assert from "node:assert/strict";
import { matchCustomAnswer } from "../src/providers/knowledge";
import type { CustomAnswer } from "../src/knowledge/types";
const answers: CustomAnswer[] = [
  {
    id: "water",
    question: "Do you repair water damage?",
    variations: ["My phone got wet"],
    answer: "Bring it in for inspection.",
  },
];
const response =
  (result: unknown): typeof fetch =>
  async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(result) } }],
    });
test("semantic matching selects a saved ID without generating customer answer text", async () => {
  let sawQuestion = false;
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    sawQuestion =
      body.messages[1].content.includes("My phone fell in a pool") &&
      body.messages[1].content.includes(answers[0].question);
    return response({ answerId: "water", confidence: 0.96, ambiguous: false })(
      _url,
      init,
    );
  };
  assert.equal(
    await matchCustomAnswer(
      "My phone fell in a pool",
      answers,
      "test-only-key",
      fetcher,
    ),
    "water",
  );
  assert.equal(sawQuestion, true);
});
test("semantic matching declines ambiguity, low confidence, unknown IDs and malformed/provider failures", async () => {
  for (const value of [
    { answerId: "water", confidence: 0.5, ambiguous: false },
    { answerId: "water", confidence: 0.99, ambiguous: true },
    { answerId: "made-up", confidence: 1, ambiguous: false },
    { answerId: null, confidence: 1, ambiguous: false },
    { text: "invented answer" },
  ]) {
    assert.equal(
      await matchCustomAnswer(
        "a question",
        answers,
        "test-only-key",
        response(value),
      ),
      null,
    );
  }
  assert.equal(
    await matchCustomAnswer(
      "a question",
      answers,
      "test-only-key",
      async () => new Response("bad", { status: 503 }),
    ),
    null,
  );
  assert.equal(
    await matchCustomAnswer("a question", answers, "test-only-key", async () =>
      Response.json({ choices: [{ message: { content: "not JSON" } }] }),
    ),
    null,
  );
  assert.equal(
    await matchCustomAnswer(
      "a question",
      answers,
      "test-only-key",
      async () => {
        throw Error("offline");
      },
    ),
    null,
  );
});
test("no configured AI key or no answers makes no external request", async () => {
  const never: typeof fetch = async () => {
    throw Error("must not fetch");
  };
  assert.equal(await matchCustomAnswer("a question", answers, "", never), null);
  assert.equal(
    await matchCustomAnswer("a question", [], "test-only-key", never),
    null,
  );
});
