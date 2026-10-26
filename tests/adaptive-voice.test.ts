import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { handleVoiceWebhook } from "../src/voice/webhook";
import { db } from "../src/persistence/db";
const env = {
  TWILIO_AUTH_TOKEN: "adaptive-voice-test",
  VOICE_PUBLIC_ORIGIN: "https://voice.example",
  RECEPTIONIST_MODE: "connected",
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
const action = (xml: string) => {
  const u = new URL(xml.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"));
  return u.pathname + u.search;
};
test("voice uses adaptive follow-ups and persists device/model context between signed turns", async () => {
  const body = {
    CallSid: "CA" + randomUUID().replaceAll("-", ""),
    From: "+15555550111",
  };
  try {
    let xml = await (
      await handleVoiceWebhook(
        signed("/api/voice/incoming", body),
        "incoming",
        env,
      )
    ).text();
    xml = await (
      await handleVoiceWebhook(
        signed(action(xml), { ...body, SpeechResult: "My device is wet" }),
        "turn",
        env,
      )
    ).text();
    assert.match(xml, /what|which/i);
    assert.match(xml, /device|model/i);
    xml = await (
      await handleVoiceWebhook(
        signed(action(xml), { ...body, SpeechResult: "iPhone 14" }),
        "turn",
        env,
      )
    ).text();
    assert.doesNotMatch(xml, /what (?:is|kind|device).*model|which model/i);
    const { rows } = await db.query(
      "SELECT state FROM conversations WHERE id=(SELECT conversation_id FROM voice_calls WHERE call_sid=$1)",
      [body.CallSid],
    );
    assert.match(JSON.stringify(rows[0].state.assistant), /iPhone|iphone/);
    assert.match(JSON.stringify(rows[0].state.assistant), /14/);
  } finally {
    await db.query(
      "DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM voice_calls WHERE call_sid=$1)",
      [body.CallSid],
    );
  }
});
