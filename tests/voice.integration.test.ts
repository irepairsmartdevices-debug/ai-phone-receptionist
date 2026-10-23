import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { handleVoiceWebhook } from "../src/voice/webhook";
const env = {
  TWILIO_AUTH_TOKEN: "test-only-signing-token",
  VOICE_PUBLIC_ORIGIN: "https://voice.example",
  RECEPTIONIST_MODE: "connected",
};
function signed(path: string, body: Record<string, string>) {
  const url = "https://voice.example" + path;
  const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
    .update(
      url +
        Object.keys(body)
          .sort()
          .map((k) => k + body[k])
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
test("signed incoming voice requests are durable and deduplicated; forged requests fail", async () => {
  const body = {
    CallSid: "CA" + randomUUID().replaceAll("-", ""),
    From: "+15555550111",
  };
  const fake = new Request("http://localhost:3000/api/voice/incoming", {
    method: "POST",
    body: new URLSearchParams(body),
  });
  assert.equal((await handleVoiceWebhook(fake, "incoming", env)).status, 403);
  const response = await handleVoiceWebhook(
    signed("/api/voice/incoming", body),
    "incoming",
    env,
  );
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /AI repair assistant/);
  assert.doesNotMatch(xml, /<Record/);
  const duplicate = await handleVoiceWebhook(
    signed("/api/voice/incoming", body),
    "incoming",
    env,
  );
  assert.equal(await duplicate.text(), xml);
});
test("saved greeting and transfer settings affect calls; failed Dial callbacks offer message capture", async () => {
  const { db } = await import("../src/persistence/db");
  const prior = await db.query(
    "SELECT value FROM settings WHERE key='profile'",
  );
  try {
    await db.query(
      "INSERT INTO settings(key,value) VALUES('profile',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [
        JSON.stringify({
          businessName: "Custom Repair",
          greeting: "Welcome to Custom Repair.",
          transferNumber: "+15555550199",
        }),
      ],
    );
    const body = {
      CallSid: "CA" + randomUUID().replaceAll("-", ""),
      From: "+15555550111",
    };
    let r = await handleVoiceWebhook(
      signed("/api/voice/incoming", body),
      "incoming",
      env,
    );
    let xml = await r.text();
    assert.match(xml, /Welcome to Custom Repair/);
    const turn = (text: string) =>
      new URL(text.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"))
        .pathname +
      new URL(text.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"))
        .search;
    let path = turn(xml);
    r = await handleVoiceWebhook(
      signed(path, { ...body, SpeechResult: "transfer me to a human" }),
      "turn",
      env,
    );
    xml = await r.text();
    assert.match(xml, /<Dial/);
    assert.match(xml, /15555550199/);
    for (const status of ["busy", "failed", "no-answer"]) {
      const nextBody = {
        ...body,
        CallSid: "CA" + randomUUID().replaceAll("-", ""),
      };
      let start = await (
        await handleVoiceWebhook(
          signed("/api/voice/incoming", nextBody),
          "incoming",
          env,
        )
      ).text();
      const nextPath = turn(start);
      const response = await handleVoiceWebhook(
        signed(nextPath, { ...nextBody, DialCallStatus: status }),
        "turn",
        env,
      );
      start = await response.text();
      assert.match(start, /callback|message/i);
      const final = await handleVoiceWebhook(
        signed(turn(start), {
          ...nextBody,
          SpeechResult: "Jamie, please call me about my repair.",
        }),
        "turn",
        env,
      );
      assert.match(await final.text(), /saved for the team/);
    }
  } finally {
    if (prior.rows[0])
      await db.query("UPDATE settings SET value=$1 WHERE key='profile'", [
        prior.rows[0].value,
      ]);
    else await db.query("DELETE FROM settings WHERE key='profile'");
  }
});
test("voice state and replay cache advance atomically when persistence fails", async () => {
  const { db } = await import("../src/persistence/db");
  const body = {
    CallSid: "CA" + randomUUID().replaceAll("-", ""),
    From: "+15555550111",
  };
  const first = await (
    await handleVoiceWebhook(
      signed("/api/voice/incoming", body),
      "incoming",
      env,
    )
  ).text();
  const action = new URL(
    first.match(/action="([^"]+)"/)![1].replaceAll("&amp;", "&"),
  );
  const path = action.pathname + action.search;
  const token = action.searchParams.get("turn");
  const name = "voicefail_" + randomUUID().replaceAll("-", "");
  try {
    await db.query(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.call_sid='${body.CallSid}' THEN RAISE EXCEPTION 'Injected cache failure'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON voice_events FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    const failed = await handleVoiceWebhook(
      signed(path, { ...body, SpeechResult: "hours" }),
      "turn",
      env,
    );
    assert.doesNotMatch(await failed.text(), /invalid.example/);
    const current = await db.query(
      "SELECT next_turn FROM voice_calls WHERE call_sid=$1",
      [body.CallSid],
    );
    assert.equal(current.rows[0].next_turn, token);
  } finally {
    await db.query(`DROP TRIGGER IF EXISTS ${name} ON voice_events`);
    await db.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
  const retry = await handleVoiceWebhook(
    signed(path, { ...body, SpeechResult: "hours" }),
    "turn",
    env,
  );
  assert.equal(retry.status, 200);
  assert.match(await retry.text(), /Monday|Mon/);
});
