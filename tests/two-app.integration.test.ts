import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { HttpRepairService } from "../src/repair/http";
test("two applications verify a customer, reject cross-ticket access, book idempotently and audit a staff change", async () => {
  const checkout =
    process.env.REPAIR_CHECKOUT ?? "/workspace/shopify-phone-repair-booking";
  const directory = mkdtempSync(join(tmpdir(), "receptionist-integration-"));
  try {
    const file = join(directory, "fixture.json");
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/receptionist-test-fixture.ts", file],
      {
        cwd: checkout,
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://receptionist:local-development-only@127.0.0.1:55432/repair_integration",
          NODE_ENV: "test",
        },
        stdio: "pipe",
      },
    );
    const fixture = JSON.parse(readFileSync(file, "utf8"));
    const service = new HttpRepairService(
      "http://localhost:3001",
      process.env.REPAIR_SERVICE_TOKEN!,
    );
    const ctx = {
      conversationId: fixture.conversationId,
      operationId: randomUUID(),
    };
    const verification = await service.verify(
      fixture.challengeId,
      fixture.code,
      ctx,
    );
    assert.equal(
      verification.ok,
      true,
      "registered-contact code should verify",
    );
    if (!verification.ok) return;
    const result = await service.ticket(
      fixture.reference,
      verification.value.grant,
      ctx,
    );
    assert.equal(result.ok, true, "customer ticket should load");
    assert.equal(
      (
        await service.ticket(fixture.reference, verification.value.grant, {
          ...ctx,
          conversationId: "other",
        })
      ).ok,
      false,
      "grant must remain conversation-bound",
    );
    const staffTicket = await service.ticket(
      fixture.reference,
      fixture.grant,
      ctx,
    );
    assert.equal(staffTicket.ok, true);
    if (!staffTicket.ok) return;
    const action = {
      ticketReference: fixture.reference,
      expectedVersion: staffTicket.value.version,
      targetStatus: "CANCELLED" as const,
      confirmationId: "integration-confirmed",
    };
    const canceled = await service.changeStatus(action, fixture.grant, ctx);
    assert.equal(canceled.ok, true, "staff cancellation should commit");
    assert.deepEqual(
      await service.changeStatus(action, fixture.grant, ctx),
      canceled,
      "replayed operation should return original outcome",
    );
    assert.equal(
      (
        await service.changeStatus(action, verification.value.grant, {
          ...ctx,
          operationId: randomUUID(),
        })
      ).ok,
      false,
      "customer grant must never write",
    );
    const b = await service.business();
    assert.equal(b.ok, true);
    if (!b.ok) return;
    const location = b.value.locations[0],
      offering = b.value.offerings[0];
    let slot: string | undefined;
    for (let days = 1; days <= 7 && !slot; days++) {
      const date = new Date(Date.now() + days * 86400000)
        .toISOString()
        .slice(0, 10);
      const slots = await service.slots(location.id, offering.id, date);
      if (slots.ok) slot = slots.value[0]?.start;
    }
    assert.ok(slot, "seeded store should offer a future slot");
    const booking = {
      locationId: location.id,
      offeringId: offering.id,
      start: slot,
      firstName: "Integration",
      lastName: "Test",
      email: "integration@example.invalid",
      phone: "+15555550111",
      issue: "Local integration test",
      intakeRevision: b.value.intakeRevision,
      answers: Object.fromEntries(
        b.value.questions
          .filter((q) => !q.offeringIds || q.offeringIds.includes(offering.id))
          .map((q) => [q.id, false]),
      ),
      smsConsent: false,
      confirmationId: "confirmed-test-booking",
    };
    const bookingCtx = { ...ctx, operationId: randomUUID() };
    const booked = await service.book(booking, bookingCtx);
    assert.equal(booked.ok, true, "confirmed booking should succeed");
    assert.deepEqual(
      await service.book(booking, bookingCtx),
      booked,
      "booking retries must not duplicate",
    );
    const op = await service.operation(bookingCtx.operationId);
    assert.equal(op.ok, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
