import { NextResponse } from "next/server";
import {
  authorizationOrigin,
  authorizationRequest,
} from "../../../../src/auth/exchange";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    if ((process.env.RECEPTIONIST_MODE ?? "fixture") !== "connected")
      return NextResponse.json(
        { error: "Configure the repair-service connection first." },
        { status: 503, headers },
      );
    const origin = authorizationOrigin();
    if (new URL(request.url).origin !== origin)
      return NextResponse.redirect(new URL("/api/auth/start", origin), {
        headers,
      });
    const { url, state, verifier } = authorizationRequest();
    const r = NextResponse.redirect(url, { headers });
    r.cookies.set("staff_auth_pending", JSON.stringify({ state, verifier }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/api/auth",
      maxAge: 300,
    });
    return r;
  } catch {
    return NextResponse.redirect(
      new URL("/sign-in?error=repair_configuration", request.url),
      { headers },
    );
  }
}
