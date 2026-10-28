import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../persistence/db";
import { checkAIConnection, getAIStatus } from "./assistant";

const key = "ai:connection-check";
const reasonSchema = z.enum([
  "configuration",
  "missing_key",
  "authentication",
  "model",
  "quota",
  "timeout",
  "unavailable",
  "response",
]);
const checkSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string().datetime(),
  reason: reasonSchema.optional(),
});
const storedSchema = z.object({
  signature: z.string(),
  requestId: z.string(),
  startedAt: z.number(),
  nextCheckAt: z.number(),
  lastCheck: checkSchema.nullable(),
});
export type AIReadiness = ReturnType<typeof getAIStatus> & {
  lastCheck: z.infer<typeof checkSchema> | null;
};
type Env = Record<string, string | undefined>;
function signature(env: Env) {
  const status = getAIStatus(env);
  const secret =
    status.provider === "gemini" ? env.GEMINI_API_KEY : env.AI_PROVIDER_KEY;
  return createHmac("sha256", secret ?? "unconfigured")
    .update(
      JSON.stringify([
        status.provider,
        status.model,
        status.configured,
        status.reason ?? "",
      ]),
    )
    .digest("hex");
}
function publicStatus(env: Env, stored: unknown): AIReadiness {
  const config = getAIStatus(env);
  const parsed = storedSchema.safeParse(stored);
  return {
    ...config,
    lastCheck:
      config.configured &&
      parsed.success &&
      parsed.data.signature === signature(env)
        ? parsed.data.lastCheck
        : null,
  };
}
export async function getAIReadiness(
  env: Env = process.env,
): Promise<AIReadiness> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key=$1", [
    key,
  ]);
  return publicStatus(env, rows[0]?.value);
}
export async function runAIConnectionCheck(
  env: Env = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; readiness: AIReadiness; retryAfter?: number }> {
  if (!getAIStatus(env).configured)
    return { status: 400, readiness: publicStatus(env, undefined) };
  const client = await db.connect();
  let reservation: z.infer<typeof storedSchema>;
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('ai-connection-check'))",
    );
    const { rows } = await client.query(
      "SELECT value FROM settings WHERE key=$1",
      [key],
    );
    const parsed = storedSchema.safeParse(rows[0]?.value);
    const now = Date.now();
    const currentSignature = signature(env);
    if (
      parsed.success &&
      parsed.data.signature === currentSignature &&
      parsed.data.nextCheckAt > now
    ) {
      await client.query("COMMIT");
      return {
        status: 429,
        readiness: publicStatus(env, parsed.data),
        retryAfter: Math.ceil((parsed.data.nextCheckAt - now) / 1000),
      };
    }
    reservation = {
      signature: currentSignature,
      requestId: randomUUID(),
      startedAt: now,
      // Cover the 30-second provider check plus completion/persistence margin.
      nextCheckAt: now + 45_000,
      lastCheck:
        parsed.success && parsed.data.signature === currentSignature
          ? parsed.data.lastCheck
          : null,
    };
    await client.query(
      "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, JSON.stringify(reservation)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  let result;
  try {
    result = await checkAIConnection(env, fetcher);
  } catch {
    result = { ok: false, reason: "unavailable" };
  }
  const reason = reasonSchema.safeParse(result.reason);
  reservation.lastCheck = {
    ok: result.ok === true,
    checkedAt: new Date().toISOString(),
    ...(!result.ok
      ? { reason: reason.success ? reason.data : ("unavailable" as const) }
      : {}),
  };
  await db.query(
    "UPDATE settings SET value=$2 WHERE key=$1 AND value->>'requestId'=$3",
    [key, JSON.stringify(reservation), reservation.requestId],
  );
  return { status: 200, readiness: publicStatus(env, reservation) };
}
