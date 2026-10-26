import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { handleVoiceWebhook } from "../src/voice/webhook";
import { createKnowledge, deleteKnowledge } from "../src/knowledge/store";
import { db } from "../src/persistence/db";
const env = {
  TWILIO_AUTH_TOKEN: "knowledge-test-signature",
  VOICE_PUBLIC_ORIGIN: "https://voice.example",
  RECEPTIONIST_MODE: "connected",
  AI_PROVIDER_KEY: "knowledge-test-only-key",
};
function signed(path: string, params: Record<string, string>) {
  const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
    .update(
      env.VOICE_PUBLIC_ORIGIN +
        path +
        Object.keys(params)
          .sort()
          .map((k) => k + params[k])
          .join(""),
    )
    .digest("base64");
  return new Request("http://localhost:3000" + path, {
    method: "POST",
    headers: {
      "x-twilio-signature": signature,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
}
test("voice keeps exact model speech through intent classification and uses admin knowledge", async () => {
  const price = await createKnowledge("price", {
    category: "Phone",
    brand: "Apple",
    model: "iPhone 77 Pro",
    repair: "Screen repair",
    priceCents: 14700,
  });
  const body = {
    CallSid: "CA" + randomUUID().replaceAll("-", ""),
    From: "+15555550111",
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          { message: { content: JSON.stringify({ intent: "business" }) } },
        ],
      });
    const start = await (
      await handleVoiceWebhook(
        signed("/api/voice/incoming", body),
        "incoming",
        env,
      )
    ).text();
    const action = new URL(
      start.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"),
    );
    const response = await handleVoiceWebhook(
      signed(action.pathname + action.search, {
        ...body,
        SpeechResult: "How much is screen repair for Apple iPhone 77 Pro?",
      }),
      "turn",
      env,
    );
    assert.equal(response.status, 200);
    const answer = await response.text();
    assert.match(answer, /147/);
    assert.match(answer, /iPhone 77 Pro/);
  } finally {
    globalThis.fetch = originalFetch;
    await deleteKnowledge("price", price.id);
    await db.query(
      "DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM voice_calls WHERE call_sid=$1)",
      [body.CallSid],
    );
  }
});
