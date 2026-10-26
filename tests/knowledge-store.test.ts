import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/persistence/db";
import {
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getKnowledge,
} from "../src/knowledge/store";

test("custom answers persist, edit one row and delete without overwriting other records", async () => {
  const ids: { kind: "answer" | "price"; id: string }[] = [];
  try {
    const a = await createKnowledge("answer", {
      question: "Do you repair wet phones?",
      variations: ["My phone got wet"],
      answer: "Bring it in for inspection.",
    });
    ids.push({ kind: "answer", id: a.id });
    const b = await createKnowledge("answer", {
      question: `Warranty ${randomUUID()}?`,
      variations: [],
      answer: "Ask the shop about coverage.",
    });
    ids.push({ kind: "answer", id: b.id });
    await updateKnowledge("answer", a.id, {
      question: "Do you repair water damage?",
      variations: ["My phone got wet"],
      answer: "We inspect liquid-damaged devices.",
    });
    const saved = await getKnowledge();
    assert.equal(
      saved.answers.find((x) => x.id === a.id)?.answer,
      "We inspect liquid-damaged devices.",
    );
    assert.equal(
      saved.answers.find((x) => x.id === b.id)?.answer,
      "Ask the shop about coverage.",
    );
    await deleteKnowledge("answer", a.id);
    assert.equal(
      (await getKnowledge()).answers.some((x) => x.id === a.id),
      false,
    );
    await assert.rejects(
      () =>
        updateKnowledge("answer", a.id, {
          question: "Missing",
          variations: [],
          answer: "Never upsert unknown edits",
        }),
      /not found/i,
    );
  } finally {
    for (const item of ids) await deleteKnowledge(item.kind, item.id);
  }
});

test("manual prices validate cents and reject duplicate device identity and duplicate source overrides", async () => {
  const ids: { kind: "answer" | "price"; id: string }[] = [];
  const model = `Test ${randomUUID()}`;
  const input = {
    category: "Phone",
    brand: "Apple",
    model,
    repair: "Screen repair",
    priceCents: 12999,
  };
  try {
    const first = await createKnowledge("price", input);
    ids.push({ kind: "price", id: first.id });
    assert.equal(
      (await getKnowledge()).prices.find((x) => x.id === first.id)?.priceCents,
      12999,
    );
    await assert.rejects(
      () =>
        createKnowledge("price", {
          ...input,
          brand: " apple ",
          repair: "SCREEN REPAIR",
        }),
      /already exists/i,
    );
    await assert.rejects(() =>
      createKnowledge("price", { ...input, model: "Invalid", priceCents: 1.5 }),
    );
    await assert.rejects(() =>
      createKnowledge("price", { ...input, model: "Invalid", priceCents: -1 }),
    );
    const linked = await createKnowledge("price", {
      ...input,
      model: model + " Pro",
      sourceOfferingId: model,
    });
    ids.push({ kind: "price", id: linked.id });
    await assert.rejects(
      () =>
        createKnowledge("price", {
          ...input,
          model: model + " Ultra",
          sourceOfferingId: model,
        }),
      /override already exists/i,
    );
    await updateKnowledge("price", first.id, { ...input, priceCents: 14900 });
    assert.equal(
      (await getKnowledge()).prices.find((x) => x.id === first.id)?.priceCents,
      14900,
    );
  } finally {
    for (const item of ids) await deleteKnowledge(item.kind, item.id);
  }
});

test("knowledge validation cannot write profile settings or accept unbounded content", async () => {
  await assert.rejects(() =>
    createKnowledge("answer", {
      id: "profile",
      question: "x",
      variations: [],
      answer: "x",
    }),
  );
  await assert.rejects(() =>
    createKnowledge("answer", {
      question: "x",
      variations: [],
      answer: "x".repeat(4001),
    }),
  );
  await assert.rejects(() => deleteKnowledge("answer", "profile"));
  // Existing non-knowledge settings never appear in the public snapshot.
  assert.equal("profile" in (await getKnowledge()), false);
});

test("concurrent duplicate price creates save exactly one entry", async () => {
  const model = `Concurrent ${randomUUID()}`;
  const price = {
    category: "Phone",
    brand: "Example",
    model,
    repair: "Screen",
    priceCents: 8500,
  };
  const results = await Promise.allSettled([
    createKnowledge("price", price),
    createKnowledge("price", price),
  ]);
  const saved = results.filter((result) => result.status === "fulfilled");
  try {
    assert.equal(saved.length, 1);
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );
  } finally {
    for (const result of saved) {
      if (result.status === "fulfilled")
        await deleteKnowledge("price", result.value.id);
    }
  }
});
