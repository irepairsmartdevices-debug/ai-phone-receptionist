import { z } from "zod";
import { assertMutationOrigin, requireAdmin } from "../../../src/auth/guards";
import {
  pruneTranscripts,
  deleteConversation,
} from "../../../src/persistence/retention";
import { db } from "../../../src/persistence/db";
export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    await requireAdmin();
    return Response.json({ deleted: await pruneTranscripts(new Date()) });
  } catch {
    return Response.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    assertMutationOrigin(request);
    await requireAdmin();
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(await request.json());
    await deleteConversation(id);
    return Response.json({ deleted: true });
  } catch {
    return Response.json(
      { error: "Could not delete conversation." },
      { status: 403 },
    );
  }
}
