import test from "node:test";
import assert from "node:assert/strict";
import {
  createConversation,
  appendMessage,
  getConversation,
} from "../src/persistence/conversations";
test("conversation and redacted messages persist across database clients", async () => {
  const c = await createConversation("fixture");
  await appendMessage(c.id, "user", "My verification code is 123456");
  const loaded = await getConversation(c.id);
  assert.equal(loaded?.mode, "fixture");
  assert.equal(loaded?.messages.length, 1);
  assert.equal(loaded?.messages[0].text.includes("123456"), false);
});
