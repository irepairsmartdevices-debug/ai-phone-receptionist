import test from "node:test";
import assert from "node:assert/strict";
import { createDialoguePlanner } from "../src/providers/dialogue";
const base = { text: "My device is wet", memory: {}, answers: [] };
const good = {
  action: "ask_device",
  device: null,
  model: null,
  issue: "My device is wet",
  answerIds: [],
  question: "What device got wet?",
  ack: "sympathy",
};
test("dialogue provider accepts structured plans and never asks for arbitrary business facts", async () => {
  let body: any;
  const planner = createDialoguePlanner("test-key", async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      choices: [{ message: { content: JSON.stringify(good) } }],
    });
  });
  assert.deepEqual(await planner(base), good);
  assert.ok(body.response_format.json_schema.strict);
  assert.match(body.messages[0].content, /price|facts/i);
});
test("dialogue provider fails closed on absent key, malformed schema and provider errors", async () => {
  assert.equal(await createDialoguePlanner("")(base), null);
  for (const content of [
    "not json",
    JSON.stringify({ ...good, action: "authorize_staff" }),
    JSON.stringify({ ...good, answerIds: ["made-up"], inventedPrice: 25 }),
  ]) {
    assert.equal(
      await createDialoguePlanner("test", async () =>
        Response.json({ choices: [{ message: { content } }] }),
      )(base),
      null,
    );
  }
  assert.equal(
    await createDialoguePlanner(
      "test",
      async () => new Response("offline", { status: 503 }),
    )(base),
    null,
  );
});
