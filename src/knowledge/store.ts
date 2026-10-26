import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../persistence/db";
import type { CustomAnswer, ManualPrice, KnowledgeSnapshot } from "./types";

export type KnowledgeKind = "answer" | "price";
export class KnowledgeError extends Error {}
const title = z.string().trim().min(1).max(120);
export const AnswerInputSchema = z
  .object({
    topic: title.optional(),
    question: z.string().trim().min(1).max(500),
    variations: z.array(z.string().trim().min(1).max(500)).max(15),
    answer: z.string().trim().min(1).max(4000),
  })
  .strict();
export const PriceInputSchema = z
  .object({
    category: title,
    brand: title,
    model: title,
    repair: title,
    priceCents: z.number().int().min(0).max(100000000),
    sourceOfferingId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
const idSchema = z.string().uuid();
const answerSchema = AnswerInputSchema.extend({ id: idSchema });
const priceSchema = PriceInputSchema.extend({ id: idSchema });
const key = (kind: KnowledgeKind, id: string) =>
  `knowledge:${kind}:${idSchema.parse(id)}`;
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const identity = (p: ManualPrice) =>
  [p.category, p.brand, p.model, p.repair].map(normalize).join("\u0000");

export async function getKnowledge(): Promise<KnowledgeSnapshot> {
  const { rows } = await db.query(
    "SELECT key,value FROM settings WHERE key LIKE 'knowledge:answer:%' OR key LIKE 'knowledge:price:%' ORDER BY key",
  );
  const result: KnowledgeSnapshot = { answers: [], prices: [] };
  for (const row of rows) {
    if (row.key.startsWith("knowledge:answer:")) {
      const parsed = answerSchema.safeParse(row.value);
      if (parsed.success && row.key === key("answer", parsed.data.id))
        result.answers.push(parsed.data);
    } else {
      const parsed = priceSchema.safeParse(row.value);
      if (parsed.success && row.key === key("price", parsed.data.id))
        result.prices.push(parsed.data);
    }
  }
  return result;
}

async function saveKnowledge(
  kind: KnowledgeKind,
  id: string,
  input: unknown,
  create: boolean,
): Promise<CustomAnswer | ManualPrice> {
  const record =
    kind === "answer"
      ? { id, ...AnswerInputSchema.parse(input) }
      : { id, ...PriceInputSchema.parse(input) };
  const recordKey = key(kind, id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('knowledge-write'))",
    );
    const { rows } = await client.query(
      "SELECT key,value FROM settings WHERE key LIKE $1",
      [`knowledge:${kind}:%`],
    );
    const existing = rows.find((row) => row.key === recordKey);
    if (!create && !existing)
      throw new KnowledgeError(
        "This entry was not found. Refresh and try again.",
      );
    if (create && rows.length >= (kind === "answer" ? 100 : 1000))
      throw new KnowledgeError(
        `The ${kind === "answer" ? "100-answer" : "1000-price"} limit has been reached.`,
      );
    if (kind === "price") {
      const price = record as ManualPrice;
      for (const row of rows) {
        if (row.key === recordKey) continue;
        const parsed = priceSchema.safeParse(row.value);
        if (!parsed.success) continue;
        if (
          price.sourceOfferingId &&
          parsed.data.sourceOfferingId === price.sourceOfferingId
        )
          throw new KnowledgeError(
            "An override already exists for this repair-software price.",
          );
        if (identity(price) === identity(parsed.data))
          throw new KnowledgeError(
            "A price already exists for this device, model and repair. Edit that entry instead.",
          );
      }
    }
    if (create)
      await client.query("INSERT INTO settings(key,value) VALUES($1,$2)", [
        recordKey,
        JSON.stringify(record),
      ]);
    else
      await client.query("UPDATE settings SET value=$2 WHERE key=$1", [
        recordKey,
        JSON.stringify(record),
      ]);
    await client.query("COMMIT");
    return record;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function createKnowledge(kind: KnowledgeKind, input: unknown) {
  return saveKnowledge(kind, randomUUID(), input, true);
}
export function updateKnowledge(
  kind: KnowledgeKind,
  id: string,
  input: unknown,
) {
  return saveKnowledge(kind, id, input, false);
}
export async function deleteKnowledge(kind: KnowledgeKind, id: string) {
  const recordKey = key(kind, id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('knowledge-write'))",
    );
    // Share the save lock so a concurrent edit cannot report a saved missing row.
    await client.query("DELETE FROM settings WHERE key=$1", [recordKey]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
