import { z } from "zod";
export const StatusSchema = z.enum([
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const TicketSchema = z.object({
  reference: z.string(),
  status: StatusSchema,
  version: z.union([z.number().int(), z.string().regex(/^[a-f0-9]{64}$/)]),
  device: z.string(),
  service: z.string(),
  location: z.string(),
  completedAt: z.string().nullable().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;
export type Mode = "fixture" | "connected";
export type Context = { conversationId: string; operationId: string };
export type Result<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "INVALID"
        | "UNAUTHORIZED"
        | "NOT_FOUND"
        | "STALE"
        | "CONFLICT"
        | "RATE_LIMITED"
        | "UNAVAILABLE"
        | "UNCERTAIN";
      operationId?: string;
    };
export const BusinessSchema = z.object({
  name: z.string(),
  profile: z.string(),
  locations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
      timeZone: z.string(),
      hours: z.string(),
    }),
  ),
  offerings: z.array(
    z.object({
      id: z.string(),
      device: z.string(),
      service: z.string(),
      price: z.number(),
      duration: z.number(),
    }),
  ),
  intakeRevision: z.string(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      version: z.string().optional(),
      offeringIds: z.array(z.string()).optional(),
    }),
  ),
});
export type Business = z.infer<typeof BusinessSchema>;
export const SlotSchema = z.object({
  start: z.string().datetime({ offset: true }),
  locationId: z.string(),
  offeringId: z.string(),
});
export type Slot = z.infer<typeof SlotSchema>;
export const BookingSchema = z
  .object({
    locationId: z.string().min(1),
    offeringId: z.string().min(1),
    start: z.string().datetime({ offset: true }),
    firstName: z.string().min(1),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().min(7),
    issue: z.string().min(1),
    intakeRevision: z.string(),
    answers: z.record(z.boolean()),
    smsConsent: z.boolean(),
    confirmationId: z.string().min(1),
  })
  .strict();
export type BookingInput = z.infer<typeof BookingSchema>;
export const ActionSchema = z
  .object({
    ticketReference: z.string(),
    expectedVersion: z.union([
      z.number().int(),
      z.string().regex(/^[a-f0-9]{64}$/),
    ]),
    targetStatus: StatusSchema,
    confirmationId: z.string(),
  })
  .strict();
export type StaffAction = z.infer<typeof ActionSchema>;
export type Operation = {
  state: "pending" | "succeeded" | "failed";
  reference?: string;
};
export interface RepairService {
  business(): Promise<Result<Business>>;
  slots(
    locationId: string,
    offeringId: string,
    date: string,
  ): Promise<Result<Slot[]>>;
  beginVerification(
    reference: string,
    context: Context,
  ): Promise<Result<{ challengeId: string }>>;
  verify(
    challengeId: string,
    code: string,
    context: Context,
  ): Promise<Result<{ grant: string }>>;
  ticket(
    reference: string,
    grant: string,
    context: Context,
  ): Promise<Result<Ticket>>;
  book(
    input: BookingInput,
    context: Context,
  ): Promise<Result<{ reference: string }>>;
  changeStatus(
    action: StaffAction,
    staffGrant: string,
    context: Context,
  ): Promise<Result<Ticket>>;
  operation(operationId: string): Promise<Result<Operation>>;
}
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
