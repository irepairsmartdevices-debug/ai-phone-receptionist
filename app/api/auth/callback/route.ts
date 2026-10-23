import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "../../../../src/persistence/db";
import { exchange, hash } from "../../../../src/auth/exchange";
export async function GET(request: NextRequest) {
  try {
    const pending = JSON.parse(
      request.cookies.get("staff_auth_pending")?.value ?? "{}",
    );
    if (
      !pending.state ||
      request.nextUrl.searchParams.get("state") !== pending.state
    )
      throw Error();
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw Error();
    const actor = await exchange(code, pending.verifier);
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions(id,role,staff_grant,expires_at) VALUES($1,$2,$3,$4)",
      [hash(token), actor.role, actor.grant, new Date(Date.now() + 900000)],
    );
    const r = NextResponse.redirect(new URL("/", process.env.APP_ORIGIN));
    r.cookies.delete("staff_auth_pending");
    r.cookies.set("receptionist_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/",
      maxAge: 900,
    });
    return r;
  } catch {
    return NextResponse.redirect(
      new URL(
        "/sign-in?error=authorization",
        process.env.APP_ORIGIN ?? "http://localhost:3000",
      ),
    );
  }
}
