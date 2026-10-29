import {
  assertMutationOrigin,
  requireAdmin,
} from "../../../../src/auth/guards";
import { runAIConnectionCheck } from "../../../../src/providers/readiness";
export const dynamic = "force-dynamic";
// Compare this admin check with the observed IAD1 provider path.
export const preferredRegion = "sfo1";
// Leave room for authorization and persistence around the bounded provider check.
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    await requireAdmin();
  } catch {
    return Response.json(
      { error: "Administrator sign-in is required to test the AI connection." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await runAIConnectionCheck();
    return Response.json(result.readiness, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store",
        ...(result.retryAfter
          ? { "Retry-After": String(result.retryAfter) }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { error: "Unable to save the connection check. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
