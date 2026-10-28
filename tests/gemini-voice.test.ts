import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { handleVoiceWebhook } from "../src/voice/webhook";
import { db } from "../src/persistence/db";

test("signed voice turns use the selected Gemini credential and persist semantic intake across turns", async () => {
  const env = {
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "voice-google-private-test-key",
    AI_PROVIDER_KEY: "wrong-openai-key",
    TWILIO_AUTH_TOKEN: "gemini-voice-signature-test",
    VOICE_PUBLIC_ORIGIN: "https://voice.example",
    RECEPTIONIST_MODE: "connected",
  };
  const params = {
    CallSid: "CA" + randomUUID().replaceAll("-", ""),
    From: "+15555550111",
  };
  function signed(path: string, extra: Record<string, string> = {}) {
    const body = { ...params, ...extra };
    const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
      .update(
        env.VOICE_PUBLIC_ORIGIN +
          path +
          Object.keys(body)
            .sort()
            .map((key) => key + body[key as keyof typeof body])
            .join(""),
      )
      .digest("base64");
    return new Request("http://localhost:3000" + path, {
      method: "POST",
      headers: {
        "x-twilio-signature": signature,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
    });
  }
  function next(xml: string) {
    const url = new URL(
      xml.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"),
    );
    return url.pathname + url.search;
  }
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      env.GEMINI_API_KEY,
    );
    assert.ok(!JSON.stringify(init?.headers).includes(env.AI_PROVIDER_KEY));
    requests++;
    const input = JSON.parse(JSON.parse(String(init?.body)).input);
    const suppliedModel = input.text === "Fairphone 5";
    const plan = {
      action: suppliedModel ? "ask_details" : "ask_device",
      device: suppliedModel ? "Fairphone" : null,
      model: suppliedModel ? "Fairphone 5" : null,
      issue: suppliedModel ? null : input.text,
      answerIds: [],
      question: null,
      ack: "none",
      nextGoal: suppliedModel ? "symptoms" : "device",
      style: "direct",
      details: {},
      catalogOfferingId: null,
      reset: null,
    };
    return Response.json({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(plan) }],
        },
      ],
    });
  };
  try {
    let xml = await (
      await handleVoiceWebhook(signed("/api/voice/incoming"), "incoming", env)
    ).text();
    for (const text of ["My handset took a swim", "Fairphone 5"]) {
      const response = await handleVoiceWebhook(
        signed(next(xml), { SpeechResult: text }),
        "turn",
        env,
      );
      assert.equal(response.status, 200);
      xml = await response.text();
      assert.doesNotMatch(xml, /sorry that happened/i);
    }
    assert.equal(requests, 2);
    const row = (
      await db.query(
        "SELECT state FROM conversations WHERE id=(SELECT conversation_id FROM voice_calls WHERE call_sid=$1)",
        [params.CallSid],
      )
    ).rows[0];
    assert.equal(row.state.assistant.model, "Fairphone 5");
    assert.match(xml, /symptom|problem|noticed/i);
    assert.ok(!xml.includes(env.GEMINI_API_KEY));
  } finally {
    globalThis.fetch = previous;
    await db.query(
      "DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM voice_calls WHERE call_sid=$1)",
      [params.CallSid],
    );
  }
});
