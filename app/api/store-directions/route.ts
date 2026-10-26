import { z } from "zod";
import { requireAdmin, assertMutationOrigin } from "../../../src/auth/guards";
import {
  getStoreDirections,
  updateStoreDirections,
  StoreDirectionsSchema,
  StoreDirectionsConflict,
} from "../../../src/persistence/store-directions";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getStoreDirections(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Administrator sign-in required." },
      { status: 401 },
    );
  }
}
export async function PUT(request: Request) {
  try {
    assertMutationOrigin(request);
    await requireAdmin();
  } catch {
    return Response.json(
      {
        error:
          "Administrator access and the correct website address are required.",
      },
      { status: 403 },
    );
  }
  try {
    const raw = await request.text();
    if (raw.length > 50000)
      return Response.json(
        { error: "Store directions are too large." },
        { status: 413 },
      );
    const input = StoreDirectionsSchema.parse(JSON.parse(raw));
    return Response.json(
      await updateStoreDirections(input.revision, input.locations),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StoreDirectionsConflict)
      return Response.json({ error: error.message }, { status: 409 });
    const message =
      error instanceof z.ZodError
        ? (error.issues.find((i) => i.code === "custom")?.message ??
          "Check the location names, field lengths and saved revision.")
        : error instanceof SyntaxError
          ? "Invalid store directions request."
          : "Unable to save store directions.";
    return Response.json({ error: message }, { status: 400 });
  }
}
