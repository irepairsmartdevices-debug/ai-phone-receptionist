# AI repair receptionist — first version

## Goal and approved scope
Build a separate receptionist application for the owner's repair business, inspired by My AI Front Desk. Customers can ask repair questions, book appointments, and check their tickets. Only authenticated staff can change repair status. Provide a dashboard, conversation history, settings, and a test conversation screen. Develop locally before deployment; enable live calls after the integration works. This is a single-business application supporting its existing multiple locations, not a subscription platform for other businesses.

The reference website could not be accessed from this environment; this specification describes the agreed functionality rather than claiming feature parity or copying its design.

## Existing system and ownership
The source of truth is github.com/irepairsmartdevices-debug/shopify-phone-repair-booking, inspected at 243776992b5e6e39b1d80b4c6851a79775c95ca7. It uses Next.js 15, TypeScript, Prisma 6, and PostgreSQL. Existing APIs expose locations, catalog, availability, booking, customer tickets, and staff repair workflows. Customer ticket APIs require customer sessions. There is no verified receptionist integration API.

The receptionist lives in ai-phone-receptionist. Integration endpoints and database migrations belong in a separate change to the repair repository. Do not connect directly to its database or reuse administrator passwords as machine credentials. Reinspect the repair repository before implementing against it, because work continues in another environment.

## Architecture and development stages
Use Next.js, TypeScript, and PostgreSQL for the receptionist dashboard and server. Keep conversation orchestration, repair API access, identity verification, and phone/model provider adapters separate. Browser requests never receive integration credentials.

1. Build a local test conversation workflow with explicit fixture mode and a repair-service adapter. Fixture results are visibly labeled and must never be represented as real bookings or live ticket changes.
2. Implement the authenticated integration in the repair app and exercise both apps against local development databases. Support separate origins and configurable service URLs; the apps need not share a Codex environment.
3. Add a Twilio voice adapter and server-side AI provider integration, then deploy to HTTPS for live webhook validation. Use provider adapters so local tests require neither paid calls nor production credentials. Provider accounts and securely configured credentials are prerequisites for live operation, not for local fixture tests.

Separate PostgreSQL databases hold each app's data. The receptionist stores business settings, conversations, tool outcomes, and audit references. Repair records and authoritative write audit entries remain in the repair app. No production data is needed for development.

## Customer conversations
The receptionist identifies itself as an AI assistant and asks the caller's purpose. Business answers come from the configured business profile and the repair app's current catalog, locations, and opening hours. Do not invent addresses, prices, availability, repair completion times, or business policies. Quotes are estimates until the repair system confirms them.

For private ticket information, require a ticket reference plus a short-lived one-time code sent to the contact already registered for that ticket. Caller ID and knowledge of a ticket number alone grant no access. Use generic failure responses, bounded attempts, expiry, rate limits, and hashed code storage. Scope verification to the conversation and matching customer/ticket. If code delivery is unavailable, offer staff follow-up without disclosing ticket details. Never speak customer passwords, private portal credentials, internal notes, or device security codes.

Return customer-visible status, device/service, location, and permitted completion information only. Respect the repair system's customer-record release rules. Public answers and booking do not require access to an existing ticket.

## Appointment booking
Collect the location, device/service, date, contact details, issue description, and current required intake answers. Fetch available slots and present local store time. Obtain explicit confirmation of the selected service, store, time, and quoted price before submitting. Recheck availability on the server and preserve the repair app's concurrency controls and validation. If a slot is lost, offer fresh alternatives.

Each confirmed booking has an idempotency key; repeated or delayed tool calls cannot create duplicates. Return the authoritative ticket reference only after success. A timeout with an uncertain write triggers reconciliation using that key, not an automatic new booking. Do not expose temporary customer-account credentials returned by existing booking endpoints. Text-message consent is a separate explicit choice.

## Staff status updates
Staff use the repair app's existing staff/admin identity, connected through a short-lived, single-use browser authorization flow. The repair app issues a scoped, revocable grant bound to the staff identity and receptionist session. Staff authenticate in its browser flow; the assistant never asks for staff passwords over a call. Voice updates require an authenticated staff dashboard session explicitly paired to that call. Unpaired calls cannot write.

The repair app enforces current role, location assignment, grant validity, and allowed actions on every request. The assistant reads back the ticket, current status, requested change, and effects and requires explicit confirmation before writing. Bind confirmation to a particular ticket version and operation; expired confirmations or changed records require another review.

Existing statuses are CONFIRMED, IN_PROGRESS, COMPLETED, and CANCELLED. Preserve existing domain workflows: IN_PROGRESS requires valid intake; COMPLETED requires checkout data and validations. Never implement a generic status setter that bypasses these prerequisites. First-version AI writes support cancellation where already permitted and other transitions only when their existing prerequisites are satisfied. Otherwise direct staff to the repair app to finish intake or checkout. Do not introduce unsupported statuses or reopen terminal tickets.

Every attempted mutation records actor, ticket, old and requested state, timestamp, operation ID, confirmation, and outcome. Persist successful changes and their authoritative audit event atomically in the repair app. Reject stale versions and use idempotency keys to make retries safe. Customers cannot acquire staff permissions through conversation instructions.

## Integration contract
Introduce a versioned, server-to-server API in the repair app for public business data, verification challenges, verified ticket reads, booking, staff authorization grants, and allowed staff repair actions. Use a dedicated rotatable machine credential over HTTPS, plus scoped customer verification or staff grants for private operations. Validate inputs and outputs with schemas, authorize each operation at the repair service, and return minimal fields.

Responses distinguish invalid input, unauthorized or expired grants, unavailable records, stale state, slot conflicts, rate limits, and dependency outages. Include operation IDs and support reconciliation of uncertain writes. Never put credentials in prompts, browser bundles, query strings, logs, or committed configuration. Use localhost HTTP only for development. Integration credentials are entered securely when needed; no production secrets are requested in chat.

## Dashboard and persistence
Provide staff sign-in through the repair-app authorization flow, an overview, conversations with summaries and tool outcomes, a test conversation screen, business settings, and integration readiness. Restrict settings and connection management to administrators. Show disconnected, fixture, and live modes clearly. Display booking and mutation success only when confirmed by the source system.

Store conversation text and operational metadata with access control. Default text retention is 30 days with deletion support; audit metadata excludes full transcripts and verification codes. Disable audio recording by default. Before live calls, configure the real business contact, transfer destination, provider credentials, and any required recording notice if recording is later enabled. Call transfer uses a configured destination; otherwise capture a callback message for staff in the dashboard. Automated outbound calls and marketing are outside this version.

## Failure handling
If the repair app is unavailable, explain that live information cannot be retrieved and offer to record a message. Do not fabricate a status or claim a booking/change succeeded. Distinguish confirmed failure from uncertain write outcomes. Retry safe reads with bounded backoff; reconcile writes by operation ID. Time out stalled tools and preserve sufficient safe context for staff follow-up. Verify phone webhook signatures, deduplicate deliveries, and do not expose internal error details to callers.

## Acceptance checks
- A customer can receive grounded business answers and book a valid appointment; conflicting and retried submissions cannot double-book.
- A verified customer can read only the matching ticket. Wrong codes, expired verification, another customer's reference, and caller-ID-only attempts reveal no private data.
- Customer conversations and unauthenticated calls cannot change statuses.
- Authorized staff can confirm an allowed change, with an atomic audit event. Wrong-location, revoked-grant, stale-version, duplicate, and missing-prerequisite requests are rejected safely.
- Existing intake, checkout, customer-record release, and notification behavior remains intact.
- Dependency outages and uncertain writes produce honest responses and recoverable operation records.
- Unit tests cover tool authorization, schemas, confirmation, and grounding; integration tests use both development apps and PostgreSQL; browser smoke checks exercise dashboard and test conversations.
- Production builds and type checks pass. Live-call readiness additionally requires a signed webhook test and a real inbound call covering voice response, a verified tool operation, and transfer/fallback. Local fixture success alone does not establish live-call readiness.

## Delivery boundaries
Do not deploy, purchase numbers, or incur live provider charges during local implementation. Deployment and live credentials are later prerequisites. Reusable installation and startup instructions will be saved after testing the implementation. Existing isolated checkouts are sufficient; do not create worktrees unless explicitly requested.

The user approved this written specification and selected direct execution of the implementation plan. Local implementation and validation are recorded in docs/VALIDATION.md.
