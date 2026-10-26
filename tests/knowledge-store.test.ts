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

test("named custom topics persist trimmed labels, edit and delete", async () => {
  let id: string | undefined;
  try {
    const created = await createKnowledge("answer", {
      topic: "  Store Location  ",
      question: "Where is your shop?",
      variations: ["How can I find you?", "What is your address?"],
      answer: "  Find us at 12 Test Street.  ",
    });
    id = created.id;
    assert.deepEqual(
      (await getKnowledge()).answers.find((entry) => entry.id === id),
      {
        id,
        topic: "Store Location",
        question: "Where is your shop?",
        variations: ["How can I find you?", "What is your address?"],
        answer: "Find us at 12 Test Street.",
      },
    );
    await updateKnowledge("answer", id, {
      topic: "  Visiting the shop  ",
      question: "Can I visit?",
      variations: ["Can I drop in?"],
      answer: "  Please call ahead.  ",
    });
    assert.deepEqual(
      (await getKnowledge()).answers.find((entry) => entry.id === id),
      {
        id,
        topic: "Visiting the shop",
        question: "Can I visit?",
        variations: ["Can I drop in?"],
        answer: "Please call ahead.",
      },
    );
    await deleteKnowledge("answer", id);
    assert.equal(
      (await getKnowledge()).answers.some((entry) => entry.id === id),
      false,
    );
  } finally {
    if (id) await deleteKnowledge("answer", id);
  }
});

test("answer writes reject empty responses and invalid topic metadata", async () => {
  const ids: string[] = [];
  const valid = {
    question: "Can I visit?",
    variations: [],
    answer: "Please call ahead.",
  };
  const invalid = [
    { ...valid, answer: "" },
    { ...valid, answer: "  " },
    { ...valid, responseType: "store_directions" },
    { ...valid, topic: "  " },
    { ...valid, topic: "x".repeat(121) },
    { ...valid, answer: undefined },
    { ...valid, answer: "x".repeat(4001) },
    { ...valid, variations: Array.from({ length: 16 }, (_, i) => `Phrase ${i}`) },
  ];
  try {
    const created = await createKnowledge("answer", {
      ...valid,
      topic: "x".repeat(120),
    });
    ids.push(created.id);
    assert.equal(
      (await getKnowledge()).answers.find((entry) => entry.id === created.id)
        ?.topic,
      "x".repeat(120),
    );
    for (const input of invalid) {
      await assert.rejects(async () => {
        const unexpected = await createKnowledge("answer", input);
        ids.push(unexpected.id);
      });
      await assert.rejects(() => updateKnowledge("answer", created.id, input));
    }
    assert.equal(
      (await getKnowledge()).answers.find((entry) => entry.id === created.id)
        ?.answer,
      "Please call ahead.",
    );
  } finally {
    for (const id of ids) await deleteKnowledge("answer", id);
  }
});

test("stored answers retain legacy shape and validate topic metadata and answer content", async () => {
  const legacy = {
    id: randomUUID(),
    question: "Do you repair tablets?",
    variations: ["Can you fix an iPad?"],
    answer: "Bring it in for inspection.",
  };
  const topic = {
    id: randomUUID(),
    topic: "Store Location",
    question: "Where are you?",
    variations: [],
    answer: "Find us at 12 Test Street.",
  };
  const invalid = [
    { ...legacy, id: randomUUID(), answer: "" },
    { ...legacy, id: randomUUID(), answer: "  " },
    { ...legacy, id: randomUUID(), responseType: "store_directions" },
    { ...legacy, id: randomUUID(), topic: "  " },
    { ...legacy, id: randomUUID(), topic: "x".repeat(121) },
  ];
  const records = [legacy, topic, ...invalid];
  try {
    for (const record of records) {
      await db.query("INSERT INTO settings(key,value) VALUES($1,$2)", [
        `knowledge:answer:${record.id}`,
        JSON.stringify(record),
      ]);
    }
    const { answers } = await getKnowledge();
    assert.deepEqual(answers.find((entry) => entry.id === legacy.id), legacy);
    assert.deepEqual(
      answers.find((entry) => entry.id === topic.id),
      topic,
    );
    for (const record of invalid) {
      assert.equal(answers.some((entry) => entry.id === record.id), false);
    }
  } finally {
    for (const record of records) await deleteKnowledge("answer", record.id);
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
