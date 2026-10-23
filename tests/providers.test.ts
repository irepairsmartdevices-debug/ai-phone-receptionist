import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validateTwilioSignature,
  voiceResponse,
} from "../src/providers/twilio";
import { parseProposal } from "../src/providers/model";
test("Twilio validation uses the canonical HTTPS URL and rejects changed parameters", () => {
  const url = "https://voice.example/api/voice/incoming",
    params = { CallSid: "CA123", From: "+15555550100" };
  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k as keyof typeof params])
      .join("");
  const signature = createHmac("sha1", "test-token")
    .update(payload)
    .digest("base64");
  assert.equal(
    validateTwilioSignature(url, params, signature, "test-token"),
    true,
  );
  assert.equal(
    validateTwilioSignature(
      url,
      { ...params, From: "+15555550101" },
      signature,
      "test-token",
    ),
    false,
  );
  assert.equal(
    validateTwilioSignature(
      "https://evil.example",
      params,
      signature,
      "test-token",
    ),
    false,
  );
});
test("voice output escapes spoken text and transfer only accepts configured E164 numbers", () => {
  const xml = voiceResponse(
    "Hello <script> & world",
    "https://voice.example/api/voice/turn",
  );
  assert.match(xml, /&lt;script&gt; &amp;/);
  assert.doesNotMatch(xml, /<Record|record=/);
  assert.throws(() =>
    voiceResponse("Transfer", "https://voice.example/api", "javascript:bad"),
  );
});
test("model output is a bounded proposal and never supplies authority or private data", () => {
  assert.equal(
    parseProposal({ intent: "staff_change", role: "admin", grant: "secret" })
      .intent,
    "staff_change",
  );
  assert.equal(
    "role" in parseProposal({ intent: "staff_change", role: "admin" }),
    false,
  );
  assert.throws(() =>
    parseProposal({ intent: "execute_sql", sql: "delete from tickets" }),
  );
});
