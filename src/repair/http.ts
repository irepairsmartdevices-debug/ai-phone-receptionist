import { z } from "zod";
import {
  BusinessSchema,
  SlotSchema,
  TicketSchema,
  type RepairService,
  type Result,
  type Context,
  type BookingInput,
  type StaffAction,
} from "../contracts/repair";
const ErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    "INVALID",
    "UNAUTHORIZED",
    "NOT_FOUND",
    "STALE",
    "CONFLICT",
    "RATE_LIMITED",
    "UNAVAILABLE",
    "UNCERTAIN",
  ]),
});
export class HttpRepairService implements RepairService {
  private base: string;
  constructor(
    origin: string,
    private token: string,
  ) {
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash || !token)
      throw Error("Invalid repair-service configuration");
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
    )
      throw Error("Repair service requires HTTPS");
    this.base = url.origin + "/api/integrations/receptionist/v1/";
  }
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    context?: Context,
    grant?: string,
  ): Promise<Result<T>> {
    if (grant?.startsWith("fixture-"))
      return { ok: false, code: "UNAUTHORIZED" };
    for (let attempt = 0; attempt < (body ? 1 : 3); attempt++) {
      try {
        const r = await fetch(this.base + path, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            ...(grant ? { "X-Receptionist-Grant": grant } : {}),
          },
          body: body ? JSON.stringify({ ...body, context }) : undefined,
          signal: AbortSignal.timeout(5000),
          redirect: "error",
          cache: "no-store",
        });
        if (!r.headers.get("content-type")?.includes("application/json"))
          throw Error("Invalid response");
        const data = await r.json();
        const error = ErrorSchema.safeParse(data);
        if (error.success) return error.data;
        if (!r.ok)
          return {
            ok: false,
            code:
              r.status === 401 || r.status === 403
                ? "UNAUTHORIZED"
                : r.status === 429
                  ? "RATE_LIMITED"
                  : "UNAVAILABLE",
          };
        const parsed = z
          .object({ ok: z.literal(true), value: schema })
          .safeParse(data);
        if (!parsed.success) throw Error("Invalid response");
        return { ok: true, value: parsed.data.value as T };
      } catch {
        if (body)
          return {
            ok: false,
            code: "UNCERTAIN",
            operationId: context?.operationId,
          };
        if (attempt === 2) return { ok: false, code: "UNAVAILABLE" };
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
    return { ok: false, code: "UNAVAILABLE" };
  }
  business() {
    return this.request("business", BusinessSchema);
  }
  slots(locationId: string, offeringId: string, date: string) {
    return this.request(
      `slots?${new URLSearchParams({ locationId, offeringId, date })}`,
      z.array(SlotSchema),
    );
  }
  beginVerification(reference: string, context: Context) {
    return this.request(
      "challenges",
      z.object({ challengeId: z.string() }),
      { reference },
      context,
    );
  }
  verify(challengeId: string, code: string, context: Context) {
    return this.request(
      "verify",
      z.object({ grant: z.string() }),
      { challengeId, code },
      context,
    );
  }
  ticket(reference: string, grant: string, context: Context) {
    return this.request(
      `tickets?${new URLSearchParams({ reference, conversationId: context.conversationId })}`,
      TicketSchema,
      undefined,
      context,
      grant,
    );
  }
  book(input: BookingInput, context: Context) {
    return this.request(
      "bookings",
      z.object({ reference: z.string() }),
      input,
      context,
    );
  }
  changeStatus(action: StaffAction, grant: string, context: Context) {
    return this.request("actions", TicketSchema, action, context, grant);
  }
  operation(operationId: string) {
    return this.request(
      `operations/${encodeURIComponent(operationId)}`,
      z.object({
        state: z.enum(["pending", "succeeded", "failed"]),
        reference: z.string().optional(),
      }),
    );
  }
}
