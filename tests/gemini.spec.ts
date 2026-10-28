import { test, expect, type Page } from "@playwright/test";
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
async function signIn(page: Page) {
  await page.goto("/settings");
  if (page.url().includes("/sign-in")) {
    await page
      .getByLabel("Admin password")
      .fill("test-admin-password-for-demo-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(origin + "/");
    await page.goto("/settings");
  }
}
test("Gemini checks require administrator sign-in and a trusted origin", async ({
  page,
  request,
}) => {
  const anonymous = await request.post("/api/ai/check", {
    headers: { origin },
  });
  expect(anonymous.status()).toBe(403);
  await signIn(page);
  const forged = await page.request.post("/api/ai/check", {
    headers: { origin: "https://untrusted.example" },
  });
  expect(forged.status()).toBe(403);
});
test("administrator checks Gemini and simulator retains semantic device context", async ({
  page,
}) => {
  await signIn(page);
  const ai = page.getByRole("region", { name: "AI connection" });
  await expect(ai).toContainText("Gemini");
  await ai.getByRole("button", { name: "Test Gemini connection" }).click();
  await expect(ai).toContainText("Connection check passed.");
  await ai.getByRole("button", { name: "Test Gemini connection" }).click();
  await expect(ai).toContainText(/Please wait \d+ seconds/);
  await page.reload();
  await expect(ai).toContainText("Connection check passed.");
  await page.goto("/test");
  for (const text of ["My handset took a swim", "Fairphone 5"]) {
    await page.getByPlaceholder("Ask your receptionist…").fill(text);
    const result = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/test-conversations") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    expect((await result).status()).toBe(200);
  }
  await expect(page.locator(".message.assistant").last()).toContainText(
    /problem|symptom|noticed/i,
  );
  await expect(page.locator(".message.assistant").last()).not.toContainText(
    /sorry that happened/i,
  );
  await page.reload();
  await expect(page.locator(".message.assistant").last()).toContainText(
    /problem|symptom|noticed/i,
  );
  expect(await page.content()).not.toContain("gemini-browser-private-key");
});
