import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {Pool} from "pg";
import {randomUUID,createHash} from "node:crypto";
test("administrator authorization connects both apps across sites and confirms a local test-ticket cancellation", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const repairOrigin = process.env.REPAIR_TEST_ORIGIN ?? "http://localhost:3001";
  expect(["localhost", "127.0.0.1"]).toContain(new URL(repairOrigin).hostname);
  const dir = mkdtempSync(join(tmpdir(), "staff-auth-"));
  try {
    const file = join(dir, "fixture.json");
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/receptionist-test-fixture.ts", file],
      {
        cwd:
          process.env.REPAIR_CHECKOUT ??
          "/workspace/shopify-phone-repair-booking",
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://receptionist:local-development-only@127.0.0.1:55432/repair_integration",
          NODE_ENV: "test",
        },
        stdio: "pipe",
      },
    );
    const f = JSON.parse(readFileSync(file, "utf8"));
    await context.addCookies([
      {
        name: "repair-admin",
        value: f.adminCookie,
        url: repairOrigin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Connect admin account" }).click();
    if (new URL(repairOrigin).hostname !== "localhost") {
      // A distinct repair hostname exercises production SameSite=Strict rules.
      await page
        .getByRole("link", { name: "Continue to administrator approval", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Connect admin account", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await page.goto("/test");
    await expect(
      page.getByText("Connected mode", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Test as").selectOption("staff");
    await expect(
      page.getByText("I’m your AI repair assistant. How can I help?", {
        exact: false,
      }),
    ).toBeVisible();
    const send = async (text: string) => {
      await page.getByPlaceholder("Ask your receptionist…").fill(text);
      await page.getByRole("button", { name: "Send message" }).click();
    };
    await send("cancel ticket");
    await expect(
      page.getByText("Enter the ticket reference", { exact: false }),
    ).toBeVisible();
    await send(f.reference);
    await expect(
      page.getByText("Confirm cancellation?", { exact: false }),
    ).toBeVisible();
    await send("confirm");
    await expect(
      page.getByText("is now cancelled.", { exact: false }),
    ).toBeVisible();
    const pool=new Pool({connectionString:'postgresql://receptionist:local-development-only@127.0.0.1:55432/receptionist'});
    const conversationId=randomUUID(),callSid='CA'+randomUUID().replaceAll('-',''),code='654321';
    try{
      await pool.query('INSERT INTO conversations(id,mode) VALUES($1,$2)',[conversationId,'connected']);
      await pool.query('INSERT INTO voice_calls(call_sid,conversation_id,next_turn) VALUES($1,$2,$3)',[callSid,conversationId,randomUUID()]);
      await pool.query('INSERT INTO voice_pairings(code_hash,call_sid,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(callSid+':'+code).digest('hex'),callSid,new Date(Date.now()+300000)]);
      await page.goto('/calls');
      const call=page.locator('.settings-row').filter({hasText:'Call …'+callSid.slice(-8)});
      await call.getByLabel('Call pairing code').fill(code);
      await call.getByRole('button',{name:'Pair',exact:true}).click();
      await expect(call.getByRole('status')).toHaveText('Paired to your authenticated staff session.');
      const linked=await pool.query('SELECT paired_session FROM voice_calls WHERE call_sid=$1',[callSid]);
      expect(linked.rows[0].paired_session).toBeTruthy();
    }finally{await pool.query('DELETE FROM conversations WHERE id=$1',[conversationId]);await pool.end();}

  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
