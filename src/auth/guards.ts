import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash } from "./exchange";
import { db } from "../persistence/db";
import { validateDemoSession } from "./demo";
export function assertLocalFixture(
  origin: string,
  mode = process.env.RECEPTIONIST_MODE ?? "fixture",
) {
  const u = new URL(origin);
  if (
    process.env.VERCEL ||
    mode !== "fixture" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.protocol !== "http:"
  )
    throw new Error("Local fixture access only");
}
export function assertMutationOrigin(request: Request) {
  const expected = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000")
    .origin;
  if (
    new URL(request.url).origin !== expected ||
    request.headers.get("origin") !== expected
  )
    throw new Error("Invalid request origin");
}
export async function requireStaff() {
  if ((process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture") {
    const token = (await cookies()).get("receptionist_session")?.value;
    if (
      process.env.DEMO_ADMIN_PASSWORD ||
      process.env.VERCEL ||
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").hostname,
      )
    ) {
      if (!token || !(await validateDemoSession(token))) redirect("/sign-in");
      return { id: token, role: "admin" as const, grant: "fixture-staff" };
    }
    assertLocalFixture(process.env.APP_ORIGIN ?? "http://localhost:3000");
    return {
      id: "fixture-local",
      role: "admin" as const,
      grant: "fixture-staff",
    };
  }
  const token = (await cookies()).get("receptionist_session")?.value;
  if (!token) redirect("/sign-in");
  const { rows } = await db.query(
    "SELECT * FROM sessions WHERE id=$1 AND expires_at>now()",
    [hash(token)],
  );
  if (!rows[0]) redirect("/sign-in");
  const check = await fetch(
    new URL(
      "/api/integrations/receptionist/v1/session",
      process.env.REPAIR_SERVICE_URL,
    ),
    {
      headers: {
        Authorization: `Bearer ${process.env.REPAIR_SERVICE_TOKEN}`,
        "X-Receptionist-Grant": rows[0].staff_grant,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
  const current = await check.json();
  if (!current.ok || current.value?.role !== "admin") redirect("/sign-in");
  rows[0].role = current.value.role;
  return {
    id: token,
    role: rows[0].role as "staff" | "admin",
    grant: rows[0].staff_grant as string,
  };
}
export async function requireAdmin() {
  const actor = await requireStaff();
  if (actor.role !== "admin") throw new Error("Administrator access required");
  return actor;
}
