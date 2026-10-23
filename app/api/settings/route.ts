import { SettingsSchema } from "../../../src/persistence/settings";
import { z } from "zod";
import { assertMutationOrigin, requireAdmin } from "../../../src/auth/guards";
import { db } from "../../../src/persistence/db";
export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    await requireAdmin();
    const settings = SettingsSchema.parse(await request.json());
    await db.query(
      "INSERT INTO settings(key,value) VALUES('profile',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [JSON.stringify(settings)],
    );
    return Response.json({ saved: true });
  } catch {
    return Response.json(
      { error: "Unable to save settings. Administrator access is required." },
      { status: 403 },
    );
  }
}
