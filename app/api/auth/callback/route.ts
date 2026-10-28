import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "../../../../src/persistence/db";
import { exchange, hash } from "../../../../src/auth/exchange";
import { RepairAuthorizationError } from "../../../../src/auth/errors";
function clearPending(response: NextResponse, secure: boolean) {
  response.cookies.set("staff_auth_pending", "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/auth",
    maxAge: 0,
  });
}
export async function GET(request: NextRequest) {
  let matchedRequest = false;
  try {
    let pending;
    try {
      pending = JSON.parse(
        request.cookies.get("staff_auth_pending")?.value ?? "{}",
      );
    } catch {
      throw new RepairAuthorizationError("connection_request_expired");
    }
    if (
      !pending ||
      typeof pending.state !== "string" ||
      !pending.state ||
      typeof pending.verifier !== "string" ||
      !pending.verifier
    )
      throw new RepairAuthorizationError("connection_request_expired");
    if (request.nextUrl.searchParams.get("state") !== pending.state)
      throw new RepairAuthorizationError("connection_request_mismatch");
    matchedRequest = true;
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new RepairAuthorizationError("authorization_code_missing");
    if ((process.env.RECEPTIONIST_MODE ?? "fixture") !== "connected")
      throw new RepairAuthorizationError("repair_configuration");
    const actor = await exchange(code, pending.verifier);
    if (actor.role !== "admin")
      throw new RepairAuthorizationError("admin_required");
    const token = randomBytes(32).toString("hex");
    try {
      await db.query(
        "INSERT INTO sessions(id,role,staff_grant,expires_at) VALUES($1,$2,$3,$4)",
        [hash(token), actor.role, actor.grant, new Date(Date.now() + 900000)],
      );
    } catch {
      throw new RepairAuthorizationError("session_store");
    }
    const r = NextResponse.redirect(new URL("/", process.env.APP_ORIGIN));
    clearPending(r, request.nextUrl.protocol === "https:");
    r.cookies.set("receptionist_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/",
      maxAge: 900,
    });
    return r;
  } catch (error) {
    const reason =
      error instanceof RepairAuthorizationError
        ? error.reason
        : "authorization";
    // Enum/status only: never log keys, cookies, codes, verifier, grants or raw errors.
    console.error("[receptionist-auth] callback failed", {
      reason,
      ...(error instanceof RepairAuthorizationError && error.status
        ? { status: error.status }
        : {}),
    });
    let origin = request.nextUrl.origin;
    try {
      if (process.env.APP_ORIGIN) {
        const app = new URL(process.env.APP_ORIGIN);
        if (app.protocol === "https:" || app.protocol === "http:")
          origin = app.origin;
      }
    } catch {
      /* use current origin */
    }
    const response = NextResponse.redirect(
      new URL("/sign-in?error=" + reason, origin),
    );
    if (matchedRequest)
      clearPending(response, request.nextUrl.protocol === "https:");
    return response;
  }
}
