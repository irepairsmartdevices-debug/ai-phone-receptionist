import { db } from "./db";
export async function pruneTranscripts(now: Date) {
  const cutoff = new Date(now.getTime() - 30 * 86400000),
    client = await db.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query(
      "SELECT id FROM conversations c WHERE created_at<$1 AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.created_at>=$1)",
      [cutoff],
    );
    const ids = old.rows.map((r) => r.id);
    await client.query(
      "UPDATE conversations SET state='{}' WHERE id=ANY($1::text[])",
      [ids],
    );
    await client.query(
      "DELETE FROM voice_calls WHERE conversation_id=ANY($1::text[])",
      [ids],
    );
    await client.query("DELETE FROM voice_events WHERE created_at<$1", [
      cutoff,
    ]);
    const result = await client.query(
      "DELETE FROM messages WHERE created_at<$1",
      [cutoff],
    );
    await client.query(
      "DELETE FROM callbacks WHERE created_at<$1 OR conversation_id=ANY($2::text[])",
      [cutoff, ids],
    );
    await client.query("DELETE FROM voice_pairings WHERE expires_at<$1", [now]);
    await client.query(
      "DELETE FROM confirmations WHERE expires_at<$1 AND consumed_at IS NULL",
      [now],
    );
    await client.query("DELETE FROM sessions WHERE expires_at<$1", [now]);
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function deleteConversation(id: string) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM callbacks WHERE conversation_id=$1", [id]);
    await client.query("DELETE FROM conversations WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
