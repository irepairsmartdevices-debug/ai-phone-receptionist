import test from "node:test";
import assert from "node:assert/strict";
import {
  issueConfirmation,
  consumeConfirmation,
} from "../src/security/confirmations";
test("confirmations are input-bound, expiring, and single-use under concurrency", async () => {
  const binding = {
    conversationId: "test-confirmation",
    actor: "staff",
    input: "ticket1001:cancel:v1",
  };
  const id = await issueConfirmation(binding);
  assert.equal(
    await consumeConfirmation(id, {
      ...binding,
      input: "ticket1002:cancel:v1",
    }),
    false,
  );
  assert.deepEqual(
    (
      await Promise.all([
        consumeConfirmation(id, binding),
        consumeConfirmation(id, binding),
      ])
    ).sort(),
    [false, true],
  );
  const expired = await issueConfirmation(binding, -1);
  assert.equal(await consumeConfirmation(expired, binding), false);
});
