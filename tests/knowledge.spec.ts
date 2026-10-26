import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:3000";
const password = "test-admin-password-for-demo-only";
const triggerLabel = "Trigger phrases (one per line, up to 15)";

test("knowledge endpoints reject anonymous reads and writes", async ({
  request,
}) => {
  const read = await request.get("/api/knowledge");
  expect(read.status()).toBe(401);
  const write = await request.post("/api/knowledge", {
    headers: { origin },
    data: {
      kind: "answer",
      question: "Unauthorized question",
      variations: [],
      answer: "Unauthorized answer",
    },
  });
  expect(write.status()).toBe(403);
});

async function signIn(page: Page) {
  await page.goto("/knowledge");
  if (page.url().includes("/sign-in")) {
    await page.getByLabel("Admin password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(origin + "/");
    await page.goto("/knowledge");
  }
  await expect(
    page.getByRole("heading", { name: "Questions, answers & repair prices" }),
  ).toBeVisible();
}

async function send(page: Page, text: string) {
  const input = page.getByPlaceholder("Ask your receptionist…");
  await expect(input).toBeEnabled();
  await input.fill(text);
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/test-conversations") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json();
  await expect(page.locator(".message.assistant").last()).toHaveText(
    result.text,
  );
  return result.text as string;
}

async function save(
  page: Page,
  buttonName: string,
  method: "POST" | "PUT" | "DELETE",
) {
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/knowledge") && r.request().method() === method,
  );
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.json();
}

for (const width of [1440, 390]) {
  test(`admin manages named topics and model prices used immediately by the receptionist (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const suffix = randomUUID().slice(0, 8);
    const question = `Do you inspect liquid damage for browser ${suffix}?`;
    const variant = `Can you inspect liquid damage for browser ${suffix}?`;
    const secondVariant = `Could you assess liquid damage for browser ${suffix}?`;
    const topic = `Liquid inspection ${suffix}`;
    const updatedTopic = `Water damage ${suffix}`;
    const answer = `Bring browser ${suffix} in for an inspection.`;
    const updatedAnswer = `We will inspect browser ${suffix} before quoting.`;
    const category = `Phone browser ${suffix}`;
    const model = "iPhone 14 Pro";
    let answerId: string | undefined;
    let priceId: string | undefined;
    await signIn(page);
    try {
      const forged = await page.request.post("/api/knowledge", {
        headers: { origin: "https://other.example" },
        data: {
          kind: "answer",
          question: "Forged question",
          variations: [],
          answer: "Forged answer",
        },
      });
      expect(forged.status()).toBe(403);
      await expect(page.getByLabel("Topic name (optional)")).toBeVisible();
      await page.getByLabel("Topic name (optional)").fill(topic);
      await page.getByLabel("Question", { exact: true }).fill(question);
      await page.getByLabel(triggerLabel).fill(`${variant}\n${secondVariant}`);
      await page
        .getByRole("textbox", { name: "Approved answer", exact: true })
        .fill(answer);
      const created = await save(page, "Add answer", "POST");
      answerId = created.answers.find(
        (row: { question: string }) => row.question === question,
      )?.id;
      expect(answerId).toBeTruthy();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: question, exact: true }),
      ).toBeVisible();
      const card = page.locator("article").filter({ hasText: question });
      await expect(card.getByText(`[${topic}]`, { exact: true })).toBeVisible();
      await expect(card).toContainText(variant);
      await expect(card).toContainText(secondVariant);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.goto("/test");
      await send(page, "restart");
      expect(await send(page, variant)).toBe(answer);
      expect(await send(page, secondVariant)).toBe(answer);
      await page.goto("/knowledge");
      await page
        .getByRole("button", { name: `Edit answer: ${question}`, exact: true })
        .click();
      await expect(page.getByLabel("Topic name (optional)")).toHaveValue(topic);
      await expect(page.getByLabel(triggerLabel)).toHaveValue(
        `${variant}\n${secondVariant}`,
      );
      await page.getByLabel("Topic name (optional)").fill(updatedTopic);
      await page
        .getByRole("textbox", { name: "Approved answer", exact: true })
        .fill(updatedAnswer);
      await save(page, "Save answer changes", "PUT");
      await page.reload();
      await expect(
        page.getByText(`[${updatedTopic}]`, { exact: true }),
      ).toBeVisible();
      await page.goto("/test");
      expect(await send(page, variant)).toBe(updatedAnswer);
      await page.goto("/knowledge");
      page.once("dialog", (dialog) => dialog.accept());
      await save(page, `Delete answer: ${question}`, "DELETE");
      await expect(
        page.getByRole("heading", { name: question, exact: true }),
      ).toHaveCount(0);
      await page.goto("/test");
      await send(page, "restart");
      const deletedReply = await send(page, variant);
      expect(deletedReply).not.toBe(answer);
      expect(deletedReply).not.toBe(updatedAnswer);

      await page.goto("/knowledge");
      await page.getByLabel("Device category", { exact: true }).fill(category);
      await page.getByLabel("Brand", { exact: true }).fill("Apple");
      await page.getByLabel("Exact model", { exact: true }).fill(model);
      await page
        .getByLabel("Repair type", { exact: true })
        .fill("Screen repair");
      await page.getByLabel("Estimate (USD)", { exact: true }).fill("147.00");
      const priceCreated = await save(page, "Add repair price", "POST");
      priceId = priceCreated.prices.find(
        (row: { category: string }) => row.category === category,
      )?.id;
      expect(priceId).toBeTruthy();
      await page.reload();
      await expect(
        page.getByRole("button", {
          name: `Edit price: Apple ${model} Screen repair`,
          exact: true,
        }),
      ).toBeVisible();
      await page.goto("/test");
      await send(page, "restart");
      const initial = await send(page, "How much is screen repair?");
      expect(initial).toMatch(/brand|device|model/i);
      expect(initial).not.toMatch(/\$147|\$99/);
      let followup = await send(page, "Apple");
      if (!followup.includes("$147")) {
        expect(followup).toMatch(/model|device/i);
        followup = await send(page, model);
      }
      expect(followup).toMatch(/\$147(?:\.00)?/);
      expect(followup).toMatch(/estimate|inspection/i);
      expect(followup).not.toMatch(/\$99/);

      await page.goto("/knowledge");
      await page
        .getByRole("button", {
          name: `Edit price: Apple ${model} Screen repair`,
          exact: true,
        })
        .click();
      await page.getByLabel("Estimate (USD)", { exact: true }).fill("159.00");
      await save(page, "Save price changes", "PUT");
      await page.goto("/test");
      expect(
        await send(page, "How much is Apple iPhone 14 Pro screen repair?"),
      ).toMatch(/\$159(?:\.00)?/);
      await page.goto("/knowledge");
      page.once("dialog", (dialog) => dialog.accept());
      await save(page, `Delete price: Apple ${model} Screen repair`, "DELETE");
      await page.goto("/test");
      await send(page, "restart");
      const removedPrice = await send(
        page,
        "How much is Apple iPhone 14 Pro screen repair?",
      );
      expect(removedPrice).not.toMatch(/\$147|\$159|\$99/);
      expect(removedPrice).toMatch(
        /callback|not have|unavailable|confirmed price/i,
      );
    } finally {
      if (answerId)
        await page.request.delete("/api/knowledge", {
          headers: { origin },
          data: { kind: "answer", id: answerId },
        });
      if (priceId)
        await page.request.delete("/api/knowledge", {
          headers: { origin },
          data: { kind: "price", id: priceId },
        });
    }
  });

  test(`Store Location example uses the owner's approved answer for every trigger (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const suffix = randomUUID().slice(0, 8);
    const question = `Where is your store located for browser ${suffix}?`;
    const answer = `For browser ${suffix}, find us across from RedBird Mall by Hair Depot.`;
    const updatedAnswer = `For browser ${suffix}, meet us beside the mall entrance.`;
    let answerId: string | undefined;
    await signIn(page);
    try {
      const before = await page.request.get("/api/knowledge");
      expect(before.status()).toBe(200);
      const beforeSnapshot = await before.json();
      await page
        .getByRole("textbox", { name: "Approved answer", exact: true })
        .fill("Unrelated unsaved draft answer");
      await expect(
        page.getByRole("button", {
          name: "Use Store Location example",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Use Store Location example",
          exact: true,
        })
        .click();
      await expect(page.getByLabel("Topic name (optional)")).toHaveValue(
        "Store Location",
      );
      await expect(page.getByLabel("Question", { exact: true })).toHaveValue(
        "Where is your store located?",
      );
      const exampleTriggers = (await page.getByLabel(triggerLabel).inputValue())
        .split("\n")
        .filter(Boolean);
      expect(exampleTriggers.length).toBeGreaterThanOrEqual(3);
      const triggers = exampleTriggers.map(
        (trigger) => `${trigger} (browser ${suffix})`,
      );
      await expect(
        page.getByRole("textbox", { name: "Approved answer", exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByRole("textbox", { name: "Approved answer", exact: true }),
      ).toHaveAttribute("required", "");
      const afterExample = await page.request.get("/api/knowledge");
      expect((await afterExample.json()).answers).toEqual(
        beforeSnapshot.answers,
      );

      await page.getByLabel("Question", { exact: true }).fill(question);
      await page.getByLabel(triggerLabel).fill(triggers.join("\n"));
      await page
        .getByRole("textbox", { name: "Approved answer", exact: true })
        .fill(answer);
      const created = await save(page, "Add answer", "POST");
      const row = created.answers.find(
        (entry: { answer: string }) => entry.answer === answer,
      );
      answerId = row?.id;
      expect(answerId).toBeTruthy();
      expect(row).toMatchObject({
        topic: "Store Location",
        answer,
        variations: triggers,
      });
      await page.reload();
      const card = page.locator("article").filter({ hasText: question });
      await expect(
        card.getByText("[Store Location]", { exact: true }),
      ).toBeVisible();
      await expect(card.getByRole("heading", { name: question })).toBeVisible();
      await expect(card).toContainText(answer);
      await expect(card).toContainText(triggers[0]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);

      await page.goto("/test");
      await send(page, "restart");
      expect(await send(page, question)).toBe(answer);
      for (const trigger of triggers)
        expect(await send(page, trigger)).toBe(answer);

      await page.goto("/knowledge");
      await page
        .getByRole("button", { name: `Edit answer: ${question}`, exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Approved answer", exact: true }),
      ).toHaveValue(answer);
      await page
        .getByLabel("Topic name (optional)")
        .fill(`Store Location ${suffix}`);
      await page
        .getByRole("textbox", { name: "Approved answer", exact: true })
        .fill(updatedAnswer);
      await save(page, "Save answer changes", "PUT");
      await page.reload();
      await expect(
        page.getByText(`[Store Location ${suffix}]`, { exact: true }),
      ).toBeVisible();
      await page.goto("/test");
      expect(await send(page, triggers[0])).toBe(updatedAnswer);
      await page.goto("/knowledge");
      page.once("dialog", (dialog) => dialog.accept());
      await save(page, `Delete answer: ${question}`, "DELETE");
      await expect(
        page.getByRole("heading", { name: question, exact: true }),
      ).toHaveCount(0);
      await page.goto("/test");
      await send(page, "restart");
      const deletedReply = await send(page, triggers[0]);
      expect(deletedReply).not.toBe(answer);
      expect(deletedReply).not.toBe(updatedAnswer);
    } finally {
      if (answerId)
        await page.request.delete("/api/knowledge", {
          headers: { origin },
          data: { kind: "answer", id: answerId },
        });
    }
  });
}

test("a saved water-damage answer handles the reported customer wording without an exact alternate", async ({
  page,
}) => {
  await signIn(page);
  const approved = "Approved water-damage policy " + randomUUID();
  let id: string | undefined;
  try {
    const response = await page.request.post("/api/knowledge", {
      headers: { origin },
      data: {
        kind: "answer",
        question: "Do you repair water-damaged phones?",
        variations: [],
        answer: approved,
      },
    });
    expect(response.status()).toBe(200);
    const snapshot = await response.json();
    id = snapshot.answers.find(
      (a: { answer: string }) => a.answer === approved,
    )?.id;
    expect(id).toBeTruthy();
    await page.goto("/test");
    await send(page, "restart");
    expect(await send(page, "do you fix water damage devices")).toBe(approved);
  } finally {
    if (id)
      await page.request.delete("/api/knowledge", {
        headers: { origin },
        data: { kind: "answer", id },
      });
  }
});
