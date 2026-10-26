import { test, expect, type Page } from "@playwright/test";

const origin = "http://localhost:3000";
const password = "test-admin-password-for-demo-only";
const address = "123 Example Avenue, Suite 100, Dallas, TX 75224";
const landmarks =
  "Across from RedBird Mall, in the same complex as Hair Depot.";
const dallas = { id: "dallas", name: "Dallas", address, landmarks };
type Guide = {
  id: string;
  name: string;
  address: string;
  landmarks: string;
  sourceLocationId?: string;
};
type DirectionsSnapshot = { revision: number; locations: Guide[] };

async function signIn(page: Page) {
  await page.goto("/settings");
  if (page.url().includes("/sign-in")) {
    await page.getByLabel("Admin password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(origin + "/");
    await page.goto("/settings");
  }
  await expect(
    page.getByRole("heading", { name: "Make it yours." }),
  ).toBeVisible();
}
async function snapshot(page: Page): Promise<DirectionsSnapshot> {
  const response = await page.request.get("/api/store-directions");
  expect(response.status()).toBe(200);
  return response.json();
}
async function configure(page: Page, locations: Guide[]) {
  const current = await snapshot(page);
  const response = await page.request.put("/api/store-directions", {
    headers: { origin },
    data: { revision: current.revision, locations },
  });
  expect(response.status()).toBe(200);
}
async function send(page: Page, text: string) {
  await page.getByPlaceholder("Ask your receptionist…").fill(text);
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/test-conversations") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const data = await response.json();
  await expect(page.locator(".message.assistant").last()).toHaveText(data.text);
  return data.text as string;
}

test("store direction edits require admin access and same-origin requests", async ({
  page,
  request,
}) => {
  const denied = await request.put("/api/store-directions", {
    headers: { origin },
    data: { revision: 0, locations: [dallas] },
  });
  expect(denied.status()).toBe(403);
  await signIn(page);
  const current = await snapshot(page);
  const forged = await page.request.put("/api/store-directions", {
    headers: { origin: "https://other.example" },
    data: current,
  });
  expect(forged.status()).toBe(403);
  expect(await snapshot(page)).toEqual(current);
});

for (const width of [1440, 390]) {
  test(`admin saves grounded directions and wet-device context survives a directions interruption (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    const prior = await snapshot(page);
    try {
      await configure(page, [{ ...dallas, address: "", landmarks: "" }]);
      await page.reload();
      await page.getByLabel("Full address", { exact: true }).fill(address);
      await page
        .getByLabel("Landmark directions", { exact: true })
        .fill(landmarks);
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/store-directions") &&
          r.request().method() === "PUT",
      );
      await page
        .getByRole("button", { name: "Save store directions", exact: true })
        .click();
      expect((await saved).status()).toBe(200);
      await page.reload();
      await expect(
        page.getByLabel("Full address", { exact: true }),
      ).toHaveValue(address);
      await expect(
        page.getByLabel("Landmark directions", { exact: true }),
      ).toHaveValue(landmarks);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);

      await page.goto("/test");
      await send(page, "restart");
      const first = await send(page, "My device is wet");
      expect(first).toMatch(/device|model|phone|tablet/i);
      const modelReply = await send(page, "iPhone 14");
      expect(modelReply).not.toMatch(
        /what (?:is |kind of )?(?:your |the )?(?:device|model)|which (?:device|model)/i,
      );
      const directions = await send(page, "How do I get to your Dallas store?");
      expect(directions).toContain(address);
      expect(directions).toContain("RedBird Mall");
      expect(directions).toContain("Hair Depot");
      await page.reload();
      await expect(page.locator(".message.assistant").last()).toHaveText(
        directions,
      );
      const ready =
        /(?:would you like|shall I|want me|can I).*(?:book|appointment|visit|inspection)/i.test(
          modelReply,
        )
          ? modelReply
          : await send(page, "It is off now and it will not turn on.");
      expect(ready).toMatch(/appointment|book|visit|inspection|callback/i);
      const next = await send(page, "yes");
      expect(next).toMatch(
        /which store|store|appointment|callback|name|contact/i,
      );
      expect(next).not.toMatch(
        /booking reference|appointment (?:is |has been )?confirmed/i,
      );
      expect(next).not.toMatch(
        /what (?:is |kind of )?(?:your |the )?(?:device|model)|which (?:device|model)/i,
      );
    } finally {
      await configure(page, prior.locations);
    }
  });
}

test("directions clarify the store and remember the selected Dallas location", async ({
  page,
}) => {
  await signIn(page);
  const prior = await snapshot(page);
  try {
    await configure(page, [
      dallas,
      {
        id: "austin-browser",
        name: "Austin",
        address: "456 Example Street, Austin, TX 78701",
        landmarks: "Fictional test landmark.",
      },
    ]);
    await page.goto("/test");
    await send(page, "restart");
    const question = await send(
      page,
      "Can you give me directions to your store?",
    );
    expect(question).toMatch(/which|choose/i);
    expect(question).toContain("Dallas");
    expect(question).toContain("Austin");
    const selected = await send(page, "Dallas");
    expect(selected).toContain(address);
    await page.reload();
    const remembered = await send(page, "What is that store address again?");
    expect(remembered).toContain(address);
    expect(remembered).not.toContain("456 Example Street");
  } finally {
    await configure(page, prior.locations);
  }
});
