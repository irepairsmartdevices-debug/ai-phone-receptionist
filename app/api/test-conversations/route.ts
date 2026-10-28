import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../../src/persistence/db";
import {
  getConversation,
  createConversation,
  appendMessage,
} from "../../../src/persistence/conversations";
import { requireStaff, assertMutationOrigin } from "../../../src/auth/guards";
import { withAudit } from "../../../src/repair/audit";
import { getService } from "../../../src/repair/service";
import { getKnowledge } from "../../../src/knowledge/store";
import { type State } from "../../../src/conversation/engine";
import { runAssistantTurn } from "../../../src/conversation/assistant";
import type { AssistantState } from "../../../src/conversation/assistant-types";
import { createAssistantProviders } from "../../../src/providers/assistant";
import { getStoreDirections } from "../../../src/persistence/store-directions";
export const dynamic = "force-dynamic";
const input = z
  .object({
    text: z.string().trim().min(1).max(2000),
    id: z.string().uuid().optional(),
    testRole: z.enum(["customer", "staff"]).default("customer"),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const staffActor = await requireStaff();
    const body = input.parse(await request.json());
    const fixture = (process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture";
    let id = body.id;
    const owned = request.cookies.get("test_conversation")?.value;
    if (id && owned !== id)
      return NextResponse.json(
        { error: "Conversation access denied." },
        { status: 403 },
      );
    if (!id)
      id = (await createConversation(fixture ? "fixture" : "connected")).id;
    const client = await db.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [id]);
      const conversation = await getConversation(id);
      if (!conversation)
        return NextResponse.json(
          { error: "Conversation not found." },
          { status: 404 },
        );
      if (conversation.mode !== (fixture ? "fixture" : "connected"))
        return NextResponse.json(
          { error: "Conversation mode changed. Start a new conversation." },
          { status: 409 },
        );
      await appendMessage(id, "user", body.text);
      const role = body.testRole;
      const providers = createAssistantProviders();
      const result = await runAssistantTurn(
        {
          service: withAudit(getService(), id),
          mode: fixture ? "fixture" : "connected",
          onPending: async (pending: State) => {
            await db.query("UPDATE conversations SET state=$2 WHERE id=$1", [
              id,
              JSON.stringify(pending),
            ]);
          },
          knowledge: await getKnowledge(),
          stores: (await getStoreDirections()).locations,
          ...providers,
        },
        conversation.state as AssistantState,
        body.text,
        {
          role,
          grant:
            role === "staff"
              ? fixture
                ? "fixture-staff"
                : staffActor.grant
              : undefined,
        },
        id,
      );
      await db.query("UPDATE conversations SET state=$2 WHERE id=$1", [
        id,
        JSON.stringify(result.state),
      ]);
      await appendMessage(id, "assistant", result.text);
      const response = NextResponse.json({
        id,
        text: result.text,
        mode: fixture ? "fixture" : "connected",
        requestId: randomUUID(),
      });
      response.cookies.set("test_conversation", id, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.APP_ORIGIN?.startsWith("https:"),
        path: "/",
        maxAge: 3600,
      });
      return response;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [id]);
      client.release();
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to process this conversation. Check access and service readiness.",
      },
      { status: 400 },
    );
  }
}
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const id = request.cookies.get("test_conversation")?.value;
    if (!id) return NextResponse.json({ messages: [] });
    const c = await getConversation(id);
    return NextResponse.json({ id, messages: c?.messages ?? [] });
  } catch {
    return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
  }
}
