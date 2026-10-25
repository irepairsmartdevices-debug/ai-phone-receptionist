import { NextRequest, NextResponse } from "next/server";
import { assertMutationOrigin } from "../../../../src/auth/guards";
import { logoutDemo } from "../../../../src/auth/demo";
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const token = request.cookies.get("receptionist_session")?.value;
    if (token) await logoutDemo(token);
    const response = NextResponse.redirect(
      new URL("/sign-in", process.env.APP_ORIGIN),
      303,
    );
    response.cookies.delete("receptionist_session");
    response.cookies.delete("test_conversation");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign out." }, { status: 400 });
  }
}
