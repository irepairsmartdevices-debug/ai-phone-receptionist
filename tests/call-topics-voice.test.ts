import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { handleVoiceWebhook } from "../src/voice/webhook";
import { createKnowledge, updateKnowledge, deleteKnowledge } from "../src/knowledge/store";
import { db } from "../src/persistence/db";

const env = {
  TWILIO_AUTH_TOKEN: "call-topics-test-signature",
  VOICE_PUBLIC_ORIGIN: "https://voice.example",
  RECEPTIONIST_MODE: "connected",
  AI_PROVIDER_KEY: "",
};
function signed(path: string, params: Record<string, string>) {
  const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
    .update(env.VOICE_PUBLIC_ORIGIN + path + Object.keys(params).sort().map((k) => k + params[k]).join(""))
    .digest("base64");
  return new Request("http://localhost:3000" + path, {
    method: "POST",
    headers: { "x-twilio-signature": signature, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}
function action(xml: string) {
  const url = new URL(xml.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"));
  return url.pathname + url.search;
}

test("signed phone-call turns use multiple topic triggers and pick up answer edits and deletion", async () => {
  const suffix = randomUUID();
  const input = {
    topic: "Store Location",
    question: "Where is your store? " + suffix,
    variations: ["I need directions " + suffix],
    answer: "Our custom entrance instructions for " + suffix,
  };
  const topic = await createKnowledge("answer", input);
  const params = { CallSid: "CA" + randomUUID().replaceAll("-", ""), From: "+15555550111" };
  try {
    let xml = await (await handleVoiceWebhook(signed("/api/voice/incoming", params), "incoming", env)).text();
    for (const phrase of [input.question, ...input.variations]) {
      const response = await handleVoiceWebhook(signed(action(xml), { ...params, SpeechResult: phrase }), "turn", env);
      assert.equal(response.status, 200);
      xml = await response.text();
      assert.ok(xml.includes(input.answer));
    }
    const updated = "Updated custom entrance instructions for " + suffix;
    await updateKnowledge("answer", topic.id, { ...input, answer: updated });
    xml = await (await handleVoiceWebhook(signed(action(xml), { ...params, SpeechResult: input.variations[0] }), "turn", env)).text();
    assert.ok(xml.includes(updated));
    await deleteKnowledge("answer", topic.id);
    xml = await (await handleVoiceWebhook(signed(action(xml), { ...params, SpeechResult: input.variations[0] }), "turn", env)).text();
    assert.ok(!xml.includes(updated));
    assert.ok(!xml.includes(input.answer));
  } finally {
    await deleteKnowledge("answer", topic.id);
    await db.query("DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM voice_calls WHERE call_sid=$1)", [params.CallSid]);
  }
});
