import test from "node:test";
import assert from "node:assert/strict";
import { TicketSchema } from "../src/contracts/repair";
import { FixtureRepairService } from "../src/repair/fixture";
test("ticket projection strips private fields and rejects unknown statuses", () => {
  const ticket = {
    reference: "1001",
    status: "CONFIRMED",
    version: 1,
    device: "Demo Phone",
    service: "Screen",
    location: "Demo Store",
    temporaryPassword: "secret",
    notes: "private",
  };
  assert.equal("temporaryPassword" in TicketSchema.parse(ticket), false);
  assert.equal("notes" in TicketSchema.parse(ticket), false);
  assert.equal(
    TicketSchema.safeParse({ ...ticket, status: "READY" }).success,
    false,
  );
});
test("fixture bookings are idempotent and conflicting payloads cannot reuse operation IDs", async () => {
  const service = new FixtureRepairService();
  const ctx = { conversationId: "c1", operationId: "op1" };
  const input = {
    locationId: "demo-north",
    offeringId: "screen",
    start: "2026-11-05T16:00:00Z",
    firstName: "Test",
    lastName: "Customer",
    email: "test@example.com",
    phone: "+15555550100",
    issue: "Broken screen",
    intakeRevision: "1",
    answers: { power: true },
    smsConsent: false,
    confirmationId: "confirmed",
  };
  const first = await service.book(input, ctx);
  assert.equal(first.ok, true);
  assert.deepEqual(await service.book(input, ctx), first);
  assert.deepEqual(await service.book({ ...input, firstName: "Other" }, ctx), {
    ok: false,
    code: "CONFLICT",
  });
});
