import { createHash, randomUUID } from "node:crypto";
import { db } from "../persistence/db";
export type Binding = { conversationId: string; actor: string; input: string };
const digest = (b: Binding) =>
  createHash("sha256")
    .update(JSON.stringify([b.conversationId, b.actor, b.input]))
    .digest("hex");
export async function issueConfirmation(binding: Binding, ttl = 300000) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO confirmations(id,binding,expires_at) VALUES($1,$2,$3)",
    [id, digest(binding), new Date(Date.now() + ttl)],
  );
  return id;
}
export async function consumeConfirmation(id: string, binding: Binding) {
  const r = await db.query(
    "UPDATE confirmations SET consumed_at=now() WHERE id=$1 AND binding=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id",
    [id, digest(binding)],
  );
  return r.rowCount === 1;
}
export async function confirmationWasConsumed(id: string, binding: Binding) {
  const r = await db.query(
    "SELECT 1 FROM confirmations WHERE id=$1 AND binding=$2 AND consumed_at IS NOT NULL",
    [id, digest(binding)],
  );
  return r.rowCount === 1;
}
