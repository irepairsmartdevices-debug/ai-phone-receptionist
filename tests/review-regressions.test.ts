import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConversationEngine } from "../src/conversation/engine";
import { FixtureRepairService } from "../src/repair/fixture";
import {
  createConversation,
  appendMessage,
  getConversation,
} from "../src/persistence/conversations";
import { db } from "../src/persistence/db";
import {
  pruneTranscripts,
  deleteConversation,
} from "../src/persistence/retention";
async function readyBooking(
  service: FixtureRepairService,
  conversationId: string,
  questions = true,
) {
  if (!questions) {
    const business = service.business.bind(service);
    service.business = async () => {
      const b = await business();
      if (!b.ok) return b;
      return { ...b, value: { ...b.value, questions: [] } };
    };
  }
  let engine = new ConversationEngine(service),
    r = await engine.turn(
      { step: "start" },
      "book",
      { role: "customer" },
      conversationId,
    );
  for (const text of [
    "1",
    "1",
    "2026-11-05",
    "1",
    "Jamie",
    "Test",
    "jamie@example.invalid",
    "+15555550111",
    "Broken screen",
    ...(questions ? ["yes"] : []),
    "no",
  ])
    r = await engine.turn(r.state, text, { role: "customer" }, conversationId);
  return { engine, state: r.state };
}
test("zero-question offerings still reach a valid booking confirmation", async () => {
  const { state } = await readyBooking(
    new FixtureRepairService(),
    randomUUID(),
    false,
  );
  assert.equal(state.step, "book-confirm");
  assert.deepEqual(state.booking?.answers, {});
});
test("a remotely committed booking with a lost response recovers its original reference", async () => {
  const service = new FixtureRepairService();
  const original = service.book.bind(service);
  let writes = 0;
  service.book = async (input, context) => {
    writes++;
    await original(input, context);
    return { ok: false, code: "UNCERTAIN", operationId: context.operationId };
  };
  const id = randomUUID(),
    { engine, state } = await readyBooking(service, id);
  let r = await engine.turn(state, "confirm", { role: "customer" }, id);
  assert.equal(r.state.step, "pending-operation");
  r = await new ConversationEngine(service).turn(
    r.state,
    "check again",
    { role: "customer" },
    id,
  );
  assert.match(r.text, /DEMO-2001/);
  assert.equal(writes, 1);
});
test("retention removes expired state, voice cache and callbacks; manual delete does too", async () => {
  const c = await createConversation("fixture"),
    callSid = "CA" + randomUUID().replaceAll("-", "");
  await db.query(
    "UPDATE conversations SET created_at=now()-interval '31 days',state=$2 WHERE id=$1",
    [
      c.id,
      JSON.stringify({
        booking: { email: "private@example.invalid", issue: "private issue" },
      }),
    ],
  );
  await db.query(
    "INSERT INTO voice_calls(call_sid,conversation_id,next_turn) VALUES($1,$2,$3)",
    [callSid, c.id, "turn"],
  );
  await db.query(
    "INSERT INTO voice_events(event_id,call_sid,response_xml) VALUES($1,$2,$3)",
    [randomUUID(), callSid, "private response"],
  );
  await db.query(
    "INSERT INTO callbacks(id,conversation_id,name,phone,message,created_at) VALUES($1,$2,'Name','15555550100','private',now()-interval '31 days')",
    [randomUUID(), c.id],
  );
  await pruneTranscripts(new Date());
  assert.deepEqual((await getConversation(c.id))?.state, {});
  assert.equal(
    (await db.query("SELECT 1 FROM voice_events WHERE call_sid=$1", [callSid]))
      .rowCount,
    0,
  );
  const fresh = await createConversation("fixture");
  await db.query(
    "INSERT INTO callbacks(id,conversation_id,name,phone,message) VALUES($1,$2,'N','15555550100','private')",
    [randomUUID(), fresh.id],
  );
  await deleteConversation(fresh.id);
  assert.equal(
    (
      await db.query("SELECT 1 FROM callbacks WHERE conversation_id=$1", [
        fresh.id,
      ])
    ).rowCount,
    0,
  );
});
test("staff mutation lost-response recovery and pre-dispatch restart retain one operation", async () => {
  const service = new FixtureRepairService(),
    actor = { role: "staff" as const, grant: "fixture-staff" },
    id = randomUUID();
  let writes = 0,
    committed = false;
  const original = service.changeStatus.bind(service);
  service.changeStatus = async (action, grant, ctx) => {
    writes++;
    const r = await original(action, grant, ctx);
    committed = r.ok;
    return { ok: false, code: "UNCERTAIN", operationId: ctx.operationId };
  };
  service.operation = async () =>
    committed
      ? { ok: true, value: { state: "succeeded", reference: "1001" } }
      : { ok: false, code: "NOT_FOUND" };
  let r = await new ConversationEngine(service).turn(
    { step: "staff-ticket" },
    "1001",
    actor,
    id,
  );
  const confirmation = r.state;
  let saved: typeof confirmation | undefined;
  const first = new ConversationEngine(service, "fixture", async (pending) => {
    saved = pending;
    throw Error("Simulated pre-dispatch process interruption");
  });
  await assert.rejects(first.turn(confirmation, "confirm", actor, id));
  assert.equal(writes, 0);
  assert.equal(saved?.step, "pending-operation");
  r = await new ConversationEngine(service).turn(saved!, "retry", actor, id);
  assert.equal(r.state.step, "pending-operation");
  r = await new ConversationEngine(service).turn(r.state, "check", actor, id);
  assert.match(r.text, /1001/);
  assert.equal(writes, 1);
});
test("DST source slots remain distinct through customer selection", async () => {
  const service = new FixtureRepairService();
  service.slots = async (locationId, offeringId) => ({
    ok: true,
    value: [
      { start: "2026-11-01T01:30:00-05:00", locationId, offeringId },
      { start: "2026-11-01T01:30:00-06:00", locationId, offeringId },
    ],
  });
  const engine = new ConversationEngine(service),
    actor = { role: "customer" as const },
    id = randomUUID();
  let r = await engine.turn({ step: "start" }, "book", actor, id);
  for (const value of ["1", "1", "2026-11-01"])
    r = await engine.turn(r.state, value, actor, id);
  assert.match(r.text, /CDT/);
  assert.match(r.text, /CST/);
  r = await engine.turn(r.state, "2", actor, id);
  assert.equal(r.state.booking?.start, "2026-11-01T01:30:00-06:00");
});
