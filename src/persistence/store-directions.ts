import { z } from "zod";
import { db } from "./db";
import type { StoreGuide } from "../conversation/assistant-types";
const key = "store-directions";
export const StoreGuideSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(600),
    landmarks: z.string().trim().max(1200),
    sourceLocationId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export const StoreDirectionsSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    locations: z.array(StoreGuideSchema).max(20),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const ids = new Set<string>(),
      names = new Set<string>(),
      links = new Set<string>();
    for (const location of snapshot.locations) {
      const name = location.name
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (
        ids.has(location.id) ||
        names.has(name) ||
        (location.sourceLocationId && links.has(location.sourceLocationId))
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Store IDs, names and linked locations must be unique.",
        });
      ids.add(location.id);
      names.add(name);
      if (location.sourceLocationId) links.add(location.sourceLocationId);
    }
  });
export type StoreDirectionsSnapshot = {
  revision: number;
  locations: StoreGuide[];
};
export class StoreDirectionsConflict extends Error {}
const defaultDirections = (): StoreDirectionsSnapshot => ({
  revision: 0,
  locations: [
    {
      id: "dallas",
      name: "Dallas",
      address: "",
      landmarks: "Across from RedBird Mall, in the same complex as Hair Depot.",
    },
  ],
});
export async function getStoreDirections(): Promise<StoreDirectionsSnapshot> {
  const { rows } = await db.query("SELECT value FROM settings WHERE key=$1", [
    key,
  ]);
  return rows[0]
    ? StoreDirectionsSchema.parse(rows[0].value)
    : defaultDirections();
}
export async function updateStoreDirections(
  revision: number,
  locations: StoreGuide[],
): Promise<StoreDirectionsSnapshot> {
  const input = StoreDirectionsSchema.parse({ revision, locations });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('store-directions-write'))",
    );
    const { rows } = await client.query(
      "SELECT value FROM settings WHERE key=$1 FOR UPDATE",
      [key],
    );
    const current = rows[0]
      ? StoreDirectionsSchema.parse(rows[0].value)
      : defaultDirections();
    if (input.revision !== current.revision)
      throw new StoreDirectionsConflict(
        "Store directions changed in another window. Reload this page before saving.",
      );
    const next = { revision: current.revision + 1, locations: input.locations };
    await client.query(
      "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, JSON.stringify(next)],
    );
    await client.query("COMMIT");
    return next;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
