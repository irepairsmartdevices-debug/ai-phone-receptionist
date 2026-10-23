import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createConversation,
  getConversation,
} from "../src/persistence/conversations";
import { FixtureRepairService } from "../src/repair/fixture";
import { withAudit } from "../src/repair/audit";
test("write attempts persist sanitized outcomes and uncertain writes remain recoverable", async () => {
  const conversation = await createConversation("fixture");
  const service = new FixtureRepairService();
  service.changeStatus = async () => ({ ok: false, code: "UNCERTAIN" });
  const audited = withAudit(service, conversation.id),
    ctx = { conversationId: conversation.id, operationId: randomUUID() };
  await audited.changeStatus(
    {
      ticketReference: "1001",
      targetStatus: "CANCELLED",
      expectedVersion: 1,
      confirmationId: "test-confirm",
    },
    "fixture-staff",
    ctx,
  );
  const c = await getConversation(conversation.id);
  assert.equal(c?.outcomes.length, 1);
  assert.match(JSON.stringify(c?.outcomes[0].result), /UNCERTAIN/);
  assert.equal(JSON.stringify(c?.outcomes).includes("fixture-staff"), false);
});
