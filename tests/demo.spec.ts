import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`admin-only demo signs in, sends a fictional message, and revokes access on logout (${width}px)`, async ({
    page,
    request,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/test");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "Admin sign-in" }),
    ).toBeVisible();
    const forged = await request.post("/api/auth/demo", {
      form: { password: "test-admin-password-for-demo-only" },
      headers: { origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(400);
    const denied = await request.post("/api/test-conversations", {
      data: { text: "What are your hours?" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(denied.status()).toBe(400);
    await page.getByLabel("Admin password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Incorrect password" }),
    ).toHaveText("Incorrect password. Please try again.");
    await page
      .getByLabel("Admin password")
      .fill("test-admin-password-for-demo-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    const authCookie = (await context.cookies()).find(
      (c) => c.name === "receptionist_session",
    );
    expect(authCookie?.httpOnly).toBe(true);
    expect(authCookie?.sameSite).toBe("Strict");
    await page.goto("/test");
    await page.getByRole("button", { name: "What are your hours?" }).click();
    await expect(
      page.getByText("Unable to process this conversation.", { exact: false }),
    ).not.toBeVisible();
    await expect(page.locator(".message").last()).toContainText(
      /Monday–Friday/,
    );
    await page.reload();
    await expect(page.locator(".message").last()).toContainText(
      /Monday–Friday/,
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/conversations");
    await expect(page).toHaveURL(/\/sign-in$/);
    await context.addCookies([authCookie!]);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}
