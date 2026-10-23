import { randomUUID } from "node:crypto";
import {
  BookingSchema,
  type RepairService,
  type BookingInput,
  type Ticket,
} from "../contracts/repair";
import {
  issueConfirmation,
  consumeConfirmation,
  confirmationWasConsumed,
} from "../security/confirmations";
export type Actor = { role: "customer" | "staff" | "admin"; grant?: string };
export type State = {
  step: string;
  pendingKind?: "booking" | "status";
  reference?: string;
  challengeId?: string;
  grant?: string;
  booking?: Partial<BookingInput>;
  field?: number;
  confirmationId?: string;
  operationId?: string;
  ticket?: Ticket;
  slots?: { start: string; label: string }[];
};
export type Turn = { text: string; state: State };
const reply = (text: string, state: State): Turn => ({ text, state });
const unavailable =
  "I cannot reach live repair information right now. I can take a callback message for the team. No booking or change has been confirmed.";

export class ConversationEngine {
  constructor(
    private service: RepairService,
    private mode: "fixture" | "connected" = "fixture",
    private onPending?: (state: State) => Promise<void>,
  ) {}
  async turn(
    state: State,
    text: string,
    actor: Actor,
    conversationId: string,
  ): Promise<Turn> {
    const value = text.trim(),
      lower = value.toLowerCase(),
      ctx = { conversationId, operationId: state.operationId ?? randomUUID() };
    if (state.step === "pending-operation") {
      const status = await this.service.operation(ctx.operationId);
      if (status.ok && status.value.state === "succeeded")
        return reply(
          `The original operation is confirmed. ${state.pendingKind === "booking" ? "Booking reference" : "Ticket reference"}: ${status.value.reference ?? state.ticket?.reference ?? "available in your repair app"}.`,
          { step: "start" },
        );
      if (status.ok && status.value.state === "failed")
        return reply(
          "The original operation failed. No successful change was recorded. You may start again.",
          { step: "start" },
        );
      if (lower === "retry" && !status.ok && status.code === "NOT_FOUND")
        return this.turn(
          {
            ...state,
            step:
              state.pendingKind === "booking"
                ? "book-confirm"
                : "staff-confirm",
          },
          "confirm",
          actor,
          conversationId,
        );
      return reply(
        `I am still reconciling operation ${ctx.operationId}. Do not submit a new booking or change. Say “retry” to retry this same operation safely, or check again later.`,
        state,
      );
    }
    if (lower === "restart" || lower === "start over")
      return reply(
        "I’m your AI repair assistant. How can I help? Ask about repairs, book an appointment, or check a ticket.",
        { step: "start" },
      );
    if (
      /\b(cancel|change status|mark .*complete|admin|ignore .*rules)\b/i.test(
        value,
      ) &&
      actor.role === "customer"
    )
      return reply(
        "Only authenticated staff can change repair statuses. Customers can check their own verified tickets.",
        { step: "start" },
      );
    if (state.step === "ticket") {
      if (!/^(?:IR-)?\d{4,10}$/.test(value))
        return reply(
          "Please enter the exact ticket number, such as 1001. I won’t guess a ticket reference.",
          state,
        );
      const reference = value.replace(/^IR-/, "").replace(/^0+(?=\d)/, ""),
        challenge = await this.service.beginVerification(reference, ctx);
      return challenge.ok
        ? reply(
            this.mode === "fixture"
              ? "Demo verification only: enter 123456. No message was sent to a real customer."
              : "If this ticket can be verified, a code will be sent to the registered contact. Enter that code.",
            {
              step: "verify",
              reference,
              challengeId: challenge.value.challengeId,
            },
          )
        : reply(unavailable, { step: "start" });
    }
    if (state.step === "verify") {
      const verification = await this.service.verify(
        state.challengeId!,
        value,
        ctx,
      );
      if (!verification.ok)
        return reply(
          "Verification could not be completed. Check the code or contact the shop.",
          state,
        );
      const ticket = await this.service.ticket(
        state.reference!,
        verification.value.grant,
        ctx,
      );
      return ticket.ok
        ? reply(
            `Ticket ${ticket.value.reference}: ${ticket.value.status.replaceAll("_", " ").toLowerCase()}. ${ticket.value.device} · ${ticket.value.service} · ${ticket.value.location}. No completion estimate is available unless confirmed by the shop.`,
            { step: "start" },
          )
        : reply(unavailable, { step: "start" });
    }
    if (state.step === "staff-ticket") {
      if (actor.role === "customer" || !actor.grant)
        return reply("Authenticate as staff before requesting changes.", {
          step: "start",
        });
      if (!/^\d{4,10}$/.test(value))
        return reply("Enter the exact numeric ticket reference.", state);
      const t = await this.service.ticket(value, actor.grant, ctx);
      if (!t.ok)
        return reply("Ticket could not be loaded with your staff access.", {
          step: "start",
        });
      if (["COMPLETED", "CANCELLED"].includes(t.value.status))
        return reply(
          "This ticket is read-only. Completed or cancelled repairs cannot be reopened here.",
          { step: "start" },
        );
      const operationId = randomUUID(),
        input = JSON.stringify({
          reference: value,
          version: t.value.version,
          target: "CANCELLED",
        }),
        confirmationId = await issueConfirmation({
          conversationId,
          actor: actor.grant,
          input,
        });
      return reply(
        `Ticket ${value} is ${t.value.status}. Confirm cancellation? This releases the appointment and records your staff action. Type “confirm” to cancel, or “restart” to leave it unchanged. Intake and checkout transitions require their existing repair-app workflows.`,
        { step: "staff-confirm", ticket: t.value, confirmationId, operationId },
      );
    }
    if (state.step === "staff-confirm") {
      if (actor.role === "customer" || !actor.grant)
        return reply("Staff authentication is required.", { step: "start" });
      if (lower !== "confirm")
        return reply("No change saved. Type “confirm” or “restart”.", state);
      const ticket = state.ticket!,
        input = JSON.stringify({
          reference: ticket.reference,
          version: ticket.version,
          target: "CANCELLED",
        });
      const binding = { conversationId, actor: actor.grant, input };
      if (!(await consumeConfirmation(state.confirmationId!, binding))) {
        if (!(await confirmationWasConsumed(state.confirmationId!, binding)))
          return reply(
            "That confirmation expired. Please review the ticket again.",
            { step: "start" },
          );
        const prior = await this.service.operation(ctx.operationId);
        if (prior.ok)
          return this.turn(
            { ...state, step: "pending-operation", pendingKind: "status" },
            "check",
            actor,
            conversationId,
          );
        if (prior.code !== "NOT_FOUND")
          return reply(
            "The original result is still unavailable. Check again later.",
            { ...state, step: "pending-operation", pendingKind: "status" },
          );
      }
      const pending: State = {
        ...state,
        step: "pending-operation",
        pendingKind: "status",
      };
      await this.onPending?.(pending);
      const r = await this.service.changeStatus(
        {
          ticketReference: ticket.reference,
          expectedVersion: ticket.version,
          targetStatus: "CANCELLED",
          confirmationId: state.confirmationId!,
        },
        actor.grant,
        ctx,
      );
      return r.ok
        ? reply(
            `${this.mode === "fixture" ? "Demo change only. " : ""}Ticket ${r.value.reference} is now cancelled.`,
            { step: "start" },
          )
        : reply(
            r.code === "UNCERTAIN"
              ? `The result is uncertain. Operation ${ctx.operationId} needs reconciliation; do not submit another change.`
              : "The change was not confirmed. Reload the ticket to review access and current status.",
            r.code === "UNCERTAIN" ? pending : { step: "start" },
          );
    }
    if (state.step === "booking")
      return this.bookingTurn(state, value, conversationId);
    if (state.step === "book-confirm") {
      if (lower !== "confirm")
        return reply(
          "No appointment has been booked. Type “confirm” to submit or “restart” to cancel.",
          state,
        );
      const input = state.booking as BookingInput;
      if (!BookingSchema.safeParse(input).success)
        return reply("Booking details are incomplete. Please start again.", {
          step: "start",
        });
      const binding = {
        conversationId,
        actor: "customer",
        input: JSON.stringify(input),
      };
      if (!(await consumeConfirmation(state.confirmationId!, binding))) {
        if (!(await confirmationWasConsumed(state.confirmationId!, binding)))
          return reply("This confirmation expired. Please start again.", {
            step: "start",
          });
        const prior = await this.service.operation(ctx.operationId);
        if (prior.ok)
          return this.turn(
            { ...state, step: "pending-operation", pendingKind: "booking" },
            "check",
            actor,
            conversationId,
          );
        if (prior.code !== "NOT_FOUND")
          return reply(
            "The original booking result is still unavailable. Check again later.",
            { ...state, step: "pending-operation", pendingKind: "booking" },
          );
      }
      const pending: State = {
        ...state,
        step: "pending-operation",
        pendingKind: "booking",
      };
      await this.onPending?.(pending);
      const r = await this.service.book(input, ctx);
      return r.ok
        ? reply(
            `${this.mode === "fixture" ? "DEMO booking only — no real appointment was created. " : ""}Booking reference: ${r.value.reference}.`,
            { step: "start" },
          )
        : reply(
            r.code === "UNCERTAIN"
              ? `The booking result is uncertain. Keep operation ${ctx.operationId} for reconciliation. Do not make a second booking.`
              : r.code === "CONFLICT"
                ? "That time is no longer available. Please start again to choose another slot."
                : unavailable,
            r.code === "UNCERTAIN" ? pending : { step: "start" },
          );
    }
    if (/\b(cancel|change status)\b/.test(lower) && actor.role !== "customer")
      return reply(
        "Enter the ticket reference to review the current status and permitted cancellation.",
        { step: "staff-ticket" },
      );
    if (/\b(ticket|status|repair ready)\b/.test(lower))
      return reply(
        "What is your ticket number? Verification is required before I share private repair information.",
        { step: "ticket" },
      );
    if (/\b(book|appointment|schedule)\b/.test(lower)) {
      const business = await this.service.business();
      if (!business.ok) return reply(unavailable, { step: "start" });
      return reply(
        `Which store? ${business.value.locations.map((l, i) => `${i + 1}. ${l.name}`).join(" · ")}`,
        { step: "booking", field: 0, booking: { answers: {} } },
      );
    }
    const business = await this.service.business();
    if (!business.ok) return reply(unavailable, { step: "start" });
    if (/\b(price|cost|screen|battery|service|repair|much)\b/.test(lower))
      return reply(
        `${business.value.offerings.map((o) => `${o.device} ${o.service}: $${o.price} estimate`).join("\n")}\nFinal pricing is confirmed by the shop after inspection. I can help book an appointment.`,
        { step: "start" },
      );
    if (/\b(hours|open|location|address|where)\b/.test(lower))
      return reply(
        business.value.locations
          .map((l) => `${l.name}: ${l.address}. ${l.hours} (${l.timeZone}).`)
          .join("\n"),
        { step: "start" },
      );
    return reply(
      "I’m your AI repair assistant. I can answer repair questions, book appointments, or check a verified ticket. For an unconfirmed completion estimate or other questions, I can take a callback message.",
      { step: "start" },
    );
  }
  private async bookingTurn(
    state: State,
    value: string,
    conversationId: string,
  ): Promise<Turn> {
    const b = await this.service.business();
    if (!b.ok) return reply(unavailable, { step: "start" });
    const booking = { ...state.booking };
    if (
      booking.intakeRevision &&
      booking.intakeRevision !== b.value.intakeRevision
    )
      return reply(
        "The intake questions changed. Please restart your booking.",
        { step: "start" },
      );
    const questions = b.value.questions.filter(
      (q) => !q.offeringIds || q.offeringIds.includes(booking.offeringId ?? ""),
    );
    const bookingFields = [
      "locationId",
      "offeringId",
      "date",
      "slot",
      "firstName",
      "lastName",
      "email",
      "phone",
      "issue",
      ...questions.map((q) => "q:" + q.id),
      "smsConsent",
    ];
    const field = state.field ?? 0,
      key = bookingFields[field];
    if (key === "locationId") {
      const l = b.value.locations.find(
        (l, i) => l.id === value || String(i + 1) === value,
      );
      if (!l) return reply("Choose a store number from the list.", state);
      booking.locationId = l.id;
    } else if (key === "offeringId") {
      const o = b.value.offerings.find(
        (o, i) => o.id === value || String(i + 1) === value,
      );
      if (!o) return reply("Choose a repair number from the list.", state);
      booking.offeringId = o.id;
      booking.intakeRevision = b.value.intakeRevision;
    } else if (key === "date") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value))
      )
        return reply("Enter a date as YYYY-MM-DD.", state);
      const slots = await this.service.slots(
        booking.locationId!,
        booking.offeringId!,
        value,
      );
      if (!slots.ok) return reply(unavailable, { step: "start" });
      if (!slots.value.length)
        return reply(
          "No times are available that day. Try another date.",
          state,
        );
      const location = b.value.locations.find(
        (l) => l.id === booking.locationId,
      )!;
      const options = slots.value.map((s) => ({
        start: s.start,
        label: new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "long",
          timeZone: location.timeZone,
        }).format(new Date(s.start)),
      }));
      return reply(
        `Choose a time at ${location.name}:\n${options.map((s, i) => `${i + 1}. ${s.label}`).join("\n")}`,
        { ...state, booking, field: field + 1, slots: options },
      );
    } else if (key === "slot") {
      const slot = state.slots?.[Number(value) - 1];
      if (!slot) return reply("Choose a time number from the list.", state);
      booking.start = slot.start;
    } else if (key.startsWith("q:")) {
      if (!/^(yes|no)$/i.test(value))
        return reply("Does the device power on? Answer yes or no.", state);
      booking.answers = {
        ...booking.answers,
        [key.slice(2)]: value.toLowerCase() === "yes",
      };
    } else if (key === "smsConsent") {
      if (!/^(yes|no)$/i.test(value))
        return reply(
          "May the shop send appointment text updates? Answer yes or no.",
          state,
        );
      booking.smsConsent = value.toLowerCase() === "yes";
      booking.intakeRevision = b.value.intakeRevision;
      booking.confirmationId = randomUUID();
      if (!BookingSchema.safeParse(booking).success)
        return reply(
          "Some booking details are invalid. Please restart and check your contact information.",
          { step: "start" },
        );
      const confirmationId = await issueConfirmation({
        conversationId,
        actor: "customer",
        input: JSON.stringify(booking),
      });
      const store = b.value.locations.find((l) => l.id === booking.locationId)!,
        offering = b.value.offerings.find((o) => o.id === booking.offeringId)!;
      return reply(
        `Review your ${this.mode === "fixture" ? "DEMO " : ""}booking:\n${offering.device} · ${offering.service} · $${offering.price} estimate\n${store.name} · ${new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "long", timeZone: store.timeZone }).format(new Date(booking.start!))}\n${booking.firstName} ${booking.lastName} · ${booking.email} · ${booking.phone}\nText updates: ${booking.smsConsent ? "yes" : "no"}\nType “confirm” to book, or “restart” to cancel.`,
        {
          step: "book-confirm",
          booking,
          confirmationId,
          operationId: randomUUID(),
        },
      );
    } else {
      if (!value || value.length > 1000)
        return reply("Please enter a shorter, nonempty answer.", state);
      if (key === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
        return reply("Enter a valid email address.", state);
      if (key === "phone" && !/^\+?[\d ()-]{7,30}$/.test(value))
        return reply("Enter a valid contact phone number.", state);
      (booking as Record<string, unknown>)[key] = value;
    }
    const prompts: Record<string, string> = {
      ...Object.fromEntries(
        questions.map((q) => ["q:" + q.id, q.text + " Answer yes or no."]),
      ),
      offeringId: `Which repair? ${b.value.offerings.map((o, i) => `${i + 1}. ${o.service} ($${o.price} estimate)`).join(" · ")}`,
      date: "What date? Enter YYYY-MM-DD.",
      firstName: "What is your first name?",
      lastName: "What is your last name?",
      email: "What is your email address?",
      phone: "What is your contact phone number?",
      issue: "Briefly describe the issue.",
      power: "Does the device power on? Answer yes or no.",
      smsConsent:
        "May the shop send appointment text updates? Answer yes or no.",
    };
    return reply(prompts[bookingFields[field + 1]] ?? "Please choose a time.", {
      ...state,
      booking,
      field: field + 1,
    });
  }
}
