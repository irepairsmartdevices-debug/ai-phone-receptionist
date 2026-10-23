import { NextResponse } from "next/server";
import { authorizationRequest } from "../../../../src/auth/exchange";
export async function GET() {
  try {
    const { url, state, verifier } = authorizationRequest();
    const r = NextResponse.redirect(url);
    r.cookies.set("staff_auth_pending", JSON.stringify({ state, verifier }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/api/auth",
      maxAge: 300,
    });
    return r;
  } catch {
    return NextResponse.json(
      { error: "Configure the repair-service connection first." },
      { status: 503 },
    );
  }
}
