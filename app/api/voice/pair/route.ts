import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assertMutationOrigin,
  requireStaff,
} from "../../../../src/auth/guards";
import { hash } from "../../../../src/auth/exchange";
import { db } from "../../../../src/persistence/db";
export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const actor = await requireStaff();
    if ((process.env.RECEPTIONIST_MODE ?? "fixture") !== "connected")
      throw Error();
    const { callSid, code } = z
      .object({
        callSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
        code: z.string().regex(/^\d{6}$/),
      })
      .strict()
      .parse(await request.json());
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        callSid,
      ]);
      const { rows } = await client.query(
        "SELECT * FROM voice_pairings WHERE call_sid=$1 AND expires_at>now() AND consumed_at IS NULL ORDER BY expires_at DESC LIMIT 1 FOR UPDATE",
        [callSid],
      );
      const pairing = rows[0];
      if (!pairing) {
        await client.query("ROLLBACK");
        return Response.json(
          { error: "Pairing could not be completed." },
          { status: 400 },
        );
      }
      await client.query(
        "UPDATE voice_pairings SET attempts=attempts+1 WHERE code_hash=$1",
        [pairing.code_hash],
      );
      if (
        pairing.attempts >= 5 ||
        pairing.code_hash !==
          createHash("sha256")
            .update(callSid + ":" + code)
            .digest("hex")
      ) {
        await client.query("COMMIT");
        return Response.json(
          { error: "Pairing could not be completed." },
          { status: 400 },
        );
      }
      await client.query(
        "UPDATE voice_pairings SET consumed_at=now() WHERE code_hash=$1",
        [pairing.code_hash],
      );
      await client.query(
        "UPDATE voice_calls SET paired_session=$2 WHERE call_sid=$1",
        [callSid, hash(actor.id)],
      );
      await client.query("COMMIT");
      return Response.json({ paired: true });
    } catch {
      await client.query("ROLLBACK");
      throw Error();
    } finally {
      client.release();
    }
  } catch {
    return Response.json(
      { error: "Staff authorization is required." },
      { status: 403 },
    );
  }
}
