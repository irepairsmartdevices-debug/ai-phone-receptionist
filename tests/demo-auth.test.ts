import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/persistence/db";
import { hash } from "../src/auth/exchange";
import * as demo from "../src/auth/demo";

test("demo authentication rejects bad credentials, expires, rotates and signs out", async () => {
  const before = { ...process.env };
  const password = "012345";
  process.env.DEMO_ADMIN_PASSWORD = password;
  process.env.RECEPTIONIST_MODE = "fixture";
  process.env.APP_ORIGIN = "https://demo.example";
  let token: string | undefined;
  try {
    await db.query("DELETE FROM settings WHERE key='demo-login-attempts'");
    assert.equal(await demo.loginDemo("incorrect"), null);
    token = (await demo.loginDemo(password))!;
    assert.ok(token);
    assert.equal(await demo.validateDemoSession(token), true);
    assert.equal(await demo.validateDemoSession(token + "forged"), false);
    const { rows } = await db.query("SELECT * FROM sessions WHERE id=$1", [
      hash(token),
    ]);
    assert.equal(rows[0].role, "admin");
    assert.notEqual(rows[0].id, token);
    process.env.DEMO_ADMIN_PASSWORD = password + "-rotated";
    assert.equal(await demo.validateDemoSession(token), false);
    process.env.DEMO_ADMIN_PASSWORD = password;
    process.env.RECEPTIONIST_MODE = "connected";
    assert.equal(await demo.validateDemoSession(token), false);
    process.env.RECEPTIONIST_MODE = "fixture";
    await db.query("UPDATE sessions SET role='staff' WHERE id=$1", [
      hash(token),
    ]);
    assert.equal(await demo.validateDemoSession(token), false);
    await db.query(
      "UPDATE sessions SET role='admin', expires_at=now()-interval '1 second' WHERE id=$1",
      [hash(token)],
    );
    assert.equal(await demo.validateDemoSession(token), false);
    await demo.logoutDemo(token);
    assert.equal(
      (await db.query("SELECT * FROM sessions WHERE id=$1", [hash(token)]))
        .rowCount,
      0,
    );
    process.env.DEMO_ADMIN_PASSWORD = "short";
    await assert.rejects(() => demo.loginDemo("short"));
  } finally {
    if (token)
      await db.query("DELETE FROM sessions WHERE id=$1", [hash(token)]);
    await db.query("DELETE FROM settings WHERE key='demo-login-attempts'");
    process.env = before;
  }
});

test("demo login throttle persists across requests and rejects even correct password once limited", async () => {
  const before = { ...process.env };
  process.env.DEMO_ADMIN_PASSWORD = "test-admin-password-for-demo-only";
  process.env.RECEPTIONIST_MODE = "fixture";
  process.env.APP_ORIGIN = "https://demo.example";
  try {
    await db.query(
      "INSERT INTO settings(key,value) VALUES('demo-login-attempts',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
      [JSON.stringify({ start: Date.now(), count: 30 })],
    );
    await assert.rejects(
      () => demo.loginDemo(process.env.DEMO_ADMIN_PASSWORD!),
      /Too many/,
    );
  } finally {
    await db.query("DELETE FROM settings WHERE key='demo-login-attempts'");
    process.env = before;
  }
});

test("admin demo accepts exactly six ASCII digits including a leading zero", () => {
  const before = { ...process.env };
  process.env.RECEPTIONIST_MODE = "fixture";
  process.env.APP_ORIGIN = "https://demo.example";
  try {
    for (const pin of ["012345", "654321"]) {
      process.env.DEMO_ADMIN_PASSWORD = pin;
      assert.equal(demo.demoConfigured(), true);
    }
    for (const invalid of [
      "12345",
      "1234567",
      "abcdef",
      "12345 ",
      "１２３４５６",
    ]) {
      process.env.DEMO_ADMIN_PASSWORD = invalid;
      assert.equal(demo.demoConfigured(), false);
    }
    process.env.DEMO_ADMIN_PASSWORD = "a-long-existing-admin-password";
    assert.equal(demo.demoConfigured(), true);
  } finally {
    process.env = before;
  }
});
