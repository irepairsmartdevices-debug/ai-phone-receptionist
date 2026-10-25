import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../persistence/db";
import { hash } from "./exchange";

export const DEMO_SESSION_SECONDS = 8 * 60 * 60;
export function demoConfigured() {
  if ((process.env.RECEPTIONIST_MODE ?? "fixture") !== "fixture") return false;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 16) return false;
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    return (
      url.protocol === "https:" ||
      (!process.env.VERCEL &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
function demoGrant() {
  return (
    "demo-admin:" +
    createHmac("sha256", process.env.DEMO_ADMIN_PASSWORD!)
      .update("receptionist-demo-session-v1")
      .digest("hex")
  );
}

export async function loginDemo(password: string): Promise<string | null> {
  if (!demoConfigured()) throw new Error("Admin demo is not configured");
  // A database-backed global limit survives serverless instance restarts and
  // avoids trusting client-supplied IP headers. Never store submitted passwords.
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('demo-login-attempts'))",
    );
    const { rows } = await client.query(
      "SELECT value FROM settings WHERE key='demo-login-attempts'",
    );
    const now = Date.now();
    const prior = rows[0]?.value;
    const current =
      prior && prior.start > now - 15 * 60 * 1000
        ? prior
        : { start: now, count: 0 };
    if (current.count >= 30)
      throw new Error("Too many attempts. Try again in 15 minutes.");
    await client.query(
      "INSERT INTO settings(key,value) VALUES('demo-login-attempts',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [JSON.stringify({ ...current, count: current.count + 1 })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (
    password.length > 4096 ||
    !timingSafeEqual(
      Buffer.from(hash(password), "hex"),
      Buffer.from(hash(process.env.DEMO_ADMIN_PASSWORD!), "hex"),
    )
  )
    return null;
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(id,role,staff_grant,expires_at) VALUES($1,'admin',$2,$3)",
    [
      hash(token),
      demoGrant(),
      new Date(Date.now() + DEMO_SESSION_SECONDS * 1000),
    ],
  );
  return token;
}
export async function validateDemoSession(token: string): Promise<boolean> {
  if (!demoConfigured() || !/^[a-f0-9]{64}$/.test(token)) return false;
  const { rows } = await db.query(
    "SELECT role,staff_grant FROM sessions WHERE id=$1 AND expires_at>now()",
    [hash(token)],
  );
  return rows[0]?.role === "admin" && rows[0]?.staff_grant === demoGrant();
}
export async function logoutDemo(token: string) {
  await db.query("DELETE FROM sessions WHERE id=$1", [hash(token)]);
}
