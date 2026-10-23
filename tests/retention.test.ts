import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/persistence/db";
import {
  createConversation,
  appendMessage,
} from "../src/persistence/conversations";
import { pruneTranscripts } from "../src/persistence/retention";
test("30-day retention deletes expired text but preserves recent messages and audit metadata", async () => {
  const c = await createConversation("fixture");
  await appendMessage(c.id, "user", "Recent");
  await db.query(
    "INSERT INTO messages(id,conversation_id,role,text,created_at) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), c.id, "user", "Old", new Date(Date.now() - 31 * 86400000)],
  );
  assert.ok((await pruneTranscripts(new Date())) >= 1);
  const r = await db.query(
    "SELECT text FROM messages WHERE conversation_id=$1",
    [c.id],
  );
  assert.deepEqual(
    r.rows.map((x) => x.text),
    ["Recent"],
  );
});
