import { getSettings } from "../persistence/settings";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { db } from "../persistence/db";
import {
  createConversation,
  appendMessage,
  getConversation,
  redact,
} from "../persistence/conversations";
import { validateTwilioSignature, voiceResponse } from "../providers/twilio";
import {
  ConversationEngine,
  type State,
  type Actor,
} from "../conversation/engine";
import { withAudit } from "../repair/audit";
import { getService } from "../repair/service";
import { OpenAIModel } from "../providers/openai";
import type { Proposal } from "../providers/model";
import { getKnowledge } from "../knowledge/store";
import { matchCustomAnswer } from "../providers/knowledge";
const xml = (body: string) =>
  new Response(body, {
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
export async function handleVoiceWebhook(
  request: Request,
  kind: "incoming" | "turn" | "status",
  env: Record<string, string | undefined> = process.env,
) {
  try {
    if (
      env.RECEPTIONIST_MODE !== "connected" ||
      !env.VOICE_PUBLIC_ORIGIN?.startsWith("https:") ||
      !env.TWILIO_AUTH_TOKEN
    )
      return new Response("Voice is not configured", { status: 503 });
    const u = new URL(request.url),
      canonical = new URL(u.pathname + u.search, env.VOICE_PUBLIC_ORIGIN).href,
      raw = await request.text();
    if (raw.length > 16000) return new Response("Too large", { status: 413 });
    const form = new URLSearchParams(raw);
    if ([...form.keys()].some((k, i, a) => a.indexOf(k) !== i))
      return new Response("Invalid form", { status: 403 });
    const params = Object.fromEntries(form);
    if (
      !validateTwilioSignature(
        canonical,
        params,
        request.headers.get("x-twilio-signature") ?? "",
        env.TWILIO_AUTH_TOKEN,
      ) ||
      !/^CA[a-f0-9]{32}$/i.test(params.CallSid ?? "")
    )
      return new Response("Forbidden", { status: 403 });
    if (kind === "status") return new Response(null, { status: 204 });
    const callSid = params.CallSid,
      eventId =
        callSid +
        ":" +
        (kind === "incoming"
          ? "incoming"
          : (u.searchParams.get("turn") ?? "invalid"));
    const client = await db.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [callSid]);
      const cached = await db.query(
        "SELECT response_xml FROM voice_events WHERE event_id=$1",
        [eventId],
      );
      if (cached.rows[0]) return xml(cached.rows[0].response_xml);
      const settings = await getSettings(env);
      let call = (
        await db.query("SELECT * FROM voice_calls WHERE call_sid=$1", [callSid])
      ).rows[0];
      if (kind === "incoming") {
        if (call) return new Response("Stale call", { status: 409 });
        const conversation = await createConversation("connected"),
          nextTurn = randomUUID();
        await db.query(
          "INSERT INTO voice_calls(call_sid,conversation_id,next_turn) VALUES($1,$2,$3)",
          [callSid, conversation.id, nextTurn],
        );
        call = {
          call_sid: callSid,
          conversation_id: conversation.id,
          next_turn: nextTurn,
        };
        const greeting = `Hello, I’m the AI repair assistant for ${settings.businessName}. ${settings.greeting}`;
        const body = voiceResponse(
          greeting,
          new URL("/api/voice/turn?turn=" + nextTurn, env.VOICE_PUBLIC_ORIGIN)
            .href,
        );
        await appendMessage(conversation.id, "assistant", greeting);
        await db.query(
          "INSERT INTO voice_events(event_id,call_sid,response_xml) VALUES($1,$2,$3)",
          [eventId, callSid, body],
        );
        return xml(body);
      }
      if (!call || u.searchParams.get("turn") !== call.next_turn)
        return new Response("Stale turn", { status: 409 });
      const text = (params.SpeechResult ?? params.Digits ?? "").slice(0, 2000),
        conversation = await getConversation(call.conversation_id);
      if (!conversation) return new Response("Call not found", { status: 404 });

      let state = conversation.state as State & { callbackPending?: boolean };
      let answer: string, transfer: string | undefined;
      if (/pair staff/i.test(text)) {
        const code = String(randomInt(100000, 1000000));
        await db.query(
          "INSERT INTO voice_pairings(code_hash,call_sid,expires_at) VALUES($1,$2,$3)",
          [
            createHash("sha256")
              .update(callSid + ":" + code)
              .digest("hex"),
            callSid,
            new Date(Date.now() + 300000),
          ],
        );
        answer =
          "To pair this call, sign in to the receptionist dashboard, open Calls, choose this call, and enter the code " +
          code.split("").join(" ") +
          ". This code expires in five minutes.";
      } else if (
        params.DialCallStatus &&
        ["busy", "failed", "no-answer", "canceled"].includes(
          params.DialCallStatus,
        )
      ) {
        answer =
          "The shop could not answer. I can save a callback message. Say your name and message, and confirm we may call the number you’re calling from.";
        state = { step: "start", callbackPending: true };
      } else if (state.callbackPending) {
        await db.query(
          "INSERT INTO callbacks(id,conversation_id,name,phone,message) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            call.conversation_id,
            "Phone caller",
            params.From ?? "Not provided",
            redact(text),
          ],
        );
        answer =
          "Your callback message has been saved for the team. The shop has not yet confirmed a callback time.";
        state = { step: "start" };
      } else if (
        /human|representative|transfer|leave a message|callback/i.test(text)
      ) {
        transfer = settings.transferNumber || undefined;
        if (transfer)
          answer =
            "I’ll try to connect you to the shop. If nobody answers, please call again and ask to leave a callback message.";
        else {
          answer =
            "I can save a callback request. Say your name and message, and confirm we may call the number you’re calling from.";
          state = { step: "start", callbackPending: true };
        }
      } else {
        let actor: Actor = { role: "customer" };
        if (call.paired_session) {
          const session = (
            await db.query(
              "SELECT * FROM sessions WHERE id=$1 AND expires_at>now()",
              [call.paired_session],
            )
          ).rows[0];
          if (session)
            actor = { role: session.role, grant: session.staff_grant };
        }
        let intentHint: Proposal["intent"] | undefined;
        if ((state.step ?? "start") === "start" && env.AI_PROVIDER_KEY)
          try {
            const proposal = await new OpenAIModel(
              env.AI_PROVIDER_KEY,
            ).proposeTurn(text);
            intentHint = proposal.intent;
          } catch {
            /* Deterministic safe routing remains available during model outages. */
          }
        const result = await new ConversationEngine(
          withAudit(getService(), call.conversation_id),
          "connected",
          async (pending) => {
            await db.query("UPDATE conversations SET state=$2 WHERE id=$1", [
              call.conversation_id,
              JSON.stringify(pending),
            ]);
          },
          await getKnowledge(),
          (question, answers) =>
            matchCustomAnswer(question, answers, env.AI_PROVIDER_KEY),
        ).turn(state, text, actor, call.conversation_id, intentHint);
        state = result.state;
        answer = result.text;
      }
      const nextTurn = randomUUID(),
        nextUrl = new URL(
          "/api/voice/turn?turn=" + nextTurn,
          env.VOICE_PUBLIC_ORIGIN,
        ).href;
      const body = voiceResponse(answer, nextUrl, transfer);
      await client.query("BEGIN");
      try {
        await client.query("UPDATE conversations SET state=$2 WHERE id=$1", [
          call.conversation_id,
          JSON.stringify(state),
        ]);
        await client.query(
          "INSERT INTO messages(id,conversation_id,role,text) VALUES($1,$2,$3,$4)",
          [randomUUID(), call.conversation_id, "user", redact(text)],
        );
        await client.query(
          "INSERT INTO messages(id,conversation_id,role,text) VALUES($1,$2,$3,$4)",
          [randomUUID(), call.conversation_id, "assistant", redact(answer)],
        );
        await client.query(
          "UPDATE voice_calls SET next_turn=$2 WHERE call_sid=$1",
          [callSid, nextTurn],
        );
        await client.query(
          "INSERT INTO voice_events(event_id,call_sid,response_xml) VALUES($1,$2,$3)",
          [eventId, callSid, body],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
      return xml(body);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [callSid]);
      client.release();
    }
  } catch {
    return xml(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Live repair information is unavailable. No booking or change is confirmed. Please contact the shop.</Say><Hangup/></Response>',
    );
  }
}
