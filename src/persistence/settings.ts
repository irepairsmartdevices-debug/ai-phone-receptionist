import { z } from "zod";
import { db } from "./db";
export const SettingsSchema = z
  .object({
    businessName: z.string().min(1).max(100),
    greeting: z.string().min(1).max(500),
    transferNumber: z.string().regex(/^(?:\+[1-9]\d{7,14})?$/),
  })
  .strict();
export async function getSettings(
  env: Record<string, string | undefined> = process.env,
) {
  const { rows } = await db.query(
    "SELECT value FROM settings WHERE key='profile'",
  );
  const parsed = SettingsSchema.safeParse(rows[0]?.value);
  return parsed.success
    ? parsed.data
    : {
        businessName: "Repair Studio",
        greeting: "How can I help you today?",
        transferNumber: /^\+[1-9]\d{7,14}$/.test(env.TRANSFER_NUMBER ?? "")
          ? env.TRANSFER_NUMBER!
          : "",
      };
}
