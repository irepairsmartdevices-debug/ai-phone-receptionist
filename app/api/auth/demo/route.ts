import { NextRequest, NextResponse } from "next/server";
import { assertMutationOrigin } from "../../../../src/auth/guards";
import { loginDemo, DEMO_SESSION_SECONDS } from "../../../../src/auth/demo";
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const body = await request.formData();
    const password = body.get("password");
    if (typeof password !== "string") throw Error();
    const token = await loginDemo(password);
    if (!token)
      return NextResponse.redirect(
        new URL("/sign-in?error=password", process.env.APP_ORIGIN),
        303,
      );
    const response = NextResponse.redirect(
      new URL("/", process.env.APP_ORIGIN),
      303,
    );
    response.cookies.set("receptionist_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/",
      maxAge: DEMO_SESSION_SECONDS,
    });
    // A new login starts a new test conversation.
    response.cookies.delete("test_conversation");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const limited =
      error instanceof Error && error.message.startsWith("Too many");
    return NextResponse.json(
      {
        error: limited
          ? "Too many sign-in attempts. Try again in 15 minutes."
          : "Unable to sign in. Check the admin demo configuration.",
      },
      { status: limited ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
