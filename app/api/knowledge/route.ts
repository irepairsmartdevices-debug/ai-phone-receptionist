import { z } from "zod";
import { assertMutationOrigin, requireAdmin } from "../../../src/auth/guards";
import {
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getKnowledge,
  KnowledgeError,
} from "../../../src/knowledge/store";
import { getService } from "../../../src/repair/service";
export const dynamic = "force-dynamic";
const envelope = z
  .object({
    kind: z.enum(["answer", "price"]),
    id: z.string().uuid().optional(),
  })
  .passthrough();
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getKnowledge(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Administrator sign-in required." },
      { status: 401 },
    );
  }
}
async function mutate(request: Request, method: "POST" | "PUT" | "DELETE") {
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
    if (raw.length > 16000)
      return Response.json({ error: "Entry is too large." }, { status: 413 });
    const body = envelope.parse(JSON.parse(raw));
    const { kind, id, ...input } = body;
    if (method === "DELETE") {
      if (!id)
        return Response.json(
          { error: "Entry ID is required." },
          { status: 400 },
        );
      await deleteKnowledge(kind, id);
    } else {
      if (kind === "price" && input.sourceOfferingId) {
        const source = await getService().business();
        if (
          !source.ok ||
          !source.value.offerings.some((o) => o.id === input.sourceOfferingId)
        )
          return Response.json(
            {
              error:
                "That repair-software price is unavailable. Refresh the catalog before linking an override.",
            },
            { status: 409 },
          );
      }
      if (method === "PUT" && !id)
        return Response.json(
          { error: "Entry ID is required." },
          { status: 400 },
        );
      if (method === "POST" && id)
        return Response.json(
          { error: "New entries cannot specify an ID." },
          { status: 400 },
        );
      if (method === "POST") await createKnowledge(kind, input);
      else await updateKnowledge(kind, id!, input);
    }
    return Response.json(
      { saved: true, ...(await getKnowledge()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Check the required fields, lengths and price amount."
        : error instanceof SyntaxError
          ? "Invalid request."
          : error instanceof KnowledgeError
            ? error.message
            : "Unable to save this entry.";
    return Response.json({ error: message }, { status: 400 });
  }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PUT = (request: Request) => mutate(request, "PUT");
export const DELETE = (request: Request) => mutate(request, "DELETE");
