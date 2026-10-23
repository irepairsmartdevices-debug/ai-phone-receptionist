# AI Repair Receptionist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a receptionist for repair questions, appointment booking, verified ticket lookups, and authenticated staff status changes.

**Architecture:** A Next.js receptionist uses a typed repair-service adapter; the existing repair app owns customer data, bookings, identity, and authoritative writes. Deliver three separately testable phases: local simulator/dashboard, secure repair integration, then phone-provider adapters. Live deployment and real calls are external readiness gates, not prerequisites for the local prototype.

**Tech Stack:** Node.js 22, Next.js App Router, TypeScript, Prisma, PostgreSQL, Zod, Node test runner with tsx, Playwright browser smoke tests; Twilio voice and an OpenAI server-side model adapter in phase C. Pin compatible dependency versions and commit the generated lockfile during implementation.

**Spec:** `docs/superpowers/specs/2026-10-22-ai-receptionist-design.md` (user approved).

## Global Constraints

- This is a single-business application supporting its existing multiple locations, not a subscription platform for other businesses.
- Only authenticated staff can change repair status.
- Browser requests never receive integration credentials.
- Do not connect directly to its database or reuse administrator passwords as machine credentials.
- Existing statuses are CONFIRMED, IN_PROGRESS, COMPLETED, and CANCELLED.
- Default text retention is 30 days with deletion support; audio recording is disabled by default.
- Do not deploy, purchase numbers, or incur live provider charges during local implementation.
- Use existing isolated checkouts; do not create worktrees unless explicitly requested.
- Preserve intake, checkout, location authorization, customer-record release, and notification rules.
- Never claim fixture data is live; never claim a write succeeded before authoritative confirmation.
- Changes to the repair app are a separate reviewed change in its own repository, never edits to its production database.

## Review Focus

- Ambiguous spoken ticket digits: ask for clarification; never select another ticket by fuzzy match (task 2).
- Daylight-saving transitions and store-local dates: present only source-provided valid slots and confirm offset-aware instants (tasks 2 and 6).
- Prompt injection in caller text or business content: cannot grant staff authority or bypass confirmation (task 2).
- Credential-bearing upstream response fields: cannot enter prompts, transcripts, or browser responses (tasks 1 and 6).
- Cancellation or disconnect during a write: preserve the operation ID and reconcile instead of reporting false failure or retrying with a new ID (tasks 6 and 7).

## Shared interfaces and file map

All paths below are in ai-phone-receptionist unless prefixed `repair:`; the latter means shopify-phone-repair-booking. Reinspect that repository before implementation and preserve its existing changes. Use named exports and schema-derived types from `src/contracts/repair.ts`:

- `Mode = 'fixture' | 'connected'`; `Status` is the four existing status strings.
- `Context = {conversationId:string; operationId:string}`.
- `Business`: approved profile text, locations (id/name/address/timeZone/hours), offerings (id/device/service/price/duration), required intake questions with revision.
- `Slot = {start:string; locationId:string; offeringId:string}`; start is an offset-aware ISO instant.
- `Ticket`: reference, status, version, customer-visible device/service/location and permitted completion fields only.
- `BookingInput`: locationId, offeringId, start, customer contact, issue, intake revision/answers, smsConsent, confirmationId.
- `StaffAction`: ticketReference, expectedVersion, targetStatus, confirmationId.
- `Result<T> = {ok:true; value:T} | {ok:false; code:'INVALID'|'UNAUTHORIZED'|'NOT_FOUND'|'STALE'|'CONFLICT'|'RATE_LIMITED'|'UNAVAILABLE'|'UNCERTAIN'; operationId?:string}`.
- `RepairService`: `business():Promise<Result<Business>>`, `slots(locationId,offeringId,date):Promise<Result<Slot[]>>`, `beginVerification(reference,context):Promise<Result<{challengeId:string}>>`, `verify(challengeId,code,context):Promise<Result<{grant:string}>>`, `ticket(reference,grant,context):Promise<Result<Ticket>>`, `book(input,context):Promise<Result<{reference:string}>>`, `changeStatus(action,staffGrant,context):Promise<Result<Ticket>>`, `operation(operationId):Promise<Result<{state:'pending'|'succeeded'|'failed'; reference?:string}>>`.
- `src/conversation/engine.ts`: deterministic tool orchestration and authorization; model output is an untrusted proposal.
- `src/security/confirmations.ts`: server-held, single-use confirmations bound to actor/conversation/input hash/version, expiring after five minutes.
- `src/repair/{fixture,http}.ts`: adapters; fixture grants and operations cannot be used by the HTTP adapter.
- `src/persistence/*`: conversations, messages, tool outcomes, settings, callback requests, retention; never repair database access.
- `src/auth/*`: staff grant exchange, application sessions and request authorization.
- `app/*`: dashboard, settings, conversation detail, simulator and server routes.
- `src/providers/*`: model and voice boundaries; `tests/*`: focused suites and two-app/browser validation.

Every task follows a red/green test cycle and a scoped commit. The assertions below are required cases, not permission to substitute mock-only checks for database or browser validation.

## Phase A — Local simulator and dashboard

### Task 1: Typed adapters and persistent local application

**Files:** Create `package.json`, lockfile, TypeScript/Next configuration, `prisma/schema.prisma`, initial migration, `.env.example`, `src/contracts/repair.ts`, `src/repair/fixture.ts`, `src/persistence/conversations.ts`, `app/layout.tsx`, `app/page.tsx`, `tests/contracts.test.ts`, `tests/persistence.test.ts`.

**Interfaces:** Produces the shared types and `RepairService` above, `createConversation(mode):Promise<{id:string}>`, `appendMessage(id,role,text):Promise<void>`, and `recordOutcome(id,operationId,result):Promise<void>`. Fixture dataset contains two clearly fictional stores, tickets in each supported status, and no real customer contacts.

- [ ] Write tests asserting schema rejection of unknown statuses, stripping of temporaryPassword/manageUrl/internal notes, fixture booking idempotency, and conversation persistence across repository instances. Example: `assert.equal(TicketSchema.parse({...validTicket,temporaryPassword:'redacted-test'}).temporaryPassword, undefined)` (access via a record in the test).
- [ ] Run `npm test -- tests/contracts.test.ts tests/persistence.test.ts`; confirm intended failures before implementing. Bootstrap only the runner/config needed to execute tests first.
- [ ] Implement schemas, fixture adapter, PostgreSQL storage, migration, and minimal app shell. Configure `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:integration`; keep secrets absent from examples and logs.
- [ ] Run focused tests against a dedicated test PostgreSQL database, run migrations twice, and run typecheck/build. Expected: tests execute, migrations are repeatable, persisted records survive reconnect, build succeeds.
- [ ] Commit as `feat: add receptionist contracts and local persistence`.

### Task 2: Grounded, permission-aware test conversations

**Files:** Create `src/conversation/{engine,tools,state}.ts`, `src/security/confirmations.ts`, `app/api/test-conversations/route.ts`, `tests/conversation.test.ts`, `tests/confirmation.test.ts`.

**Interfaces:** Consumes `RepairService`; produces `handleTurn(conversationId,text,actor):Promise<{text:string; mode:Mode; operationId?:string}>`, with actor derived by the server, never submitted as a trusted browser role. Fixture-only test actor sessions are allowed solely on loopback in explicit fixture mode and rejected in connected mode/production. Produces `issueConfirmation(binding):Promise<string>` and `consumeConfirmation(id,binding):Promise<boolean>` using persistent single-use records.

- [ ] Write tests for AI disclosure, source-grounded hours/prices, clarification for ambiguous ticket digits, verified-only reads, no caller-ID trust, and no staff authority from prompt text. Assert customer `changeStatus` attempts cause zero adapter writes; confirmation expiry, changed versions and replay also cause zero writes.
- [ ] Run `npm test -- tests/conversation.test.ts tests/confirmation.test.ts`; confirm failures for missing behavior.
- [ ] Implement explicit conversation states for question, verification, booking collection, confirmation, staff action, unavailable service, and callback. Validate tools independently of generated language. Display source-provided slots in location time including offset for ambiguous DST hours. Separate SMS consent from booking confirmation.
- [ ] Run those suites, including a DST-day booking and outage: no guessed slots, no invented success, missing verification causes no ticket response, prompt injection cannot change actor or tool privileges.
- [ ] Commit as `feat: add safe receptionist conversation workflow`.

### Task 3: Dashboard, settings, messages and retention

**Files:** Create `app/{conversations,settings,test}/page.tsx`, `app/conversations/[id]/page.tsx`, `app/api/settings/route.ts`, `app/api/retention/route.ts`, `src/auth/guards.ts`, `src/persistence/{settings,retention,callbacks}.ts`, `tests/dashboard.spec.ts`, `tests/retention.test.ts`, `README.md`.

**Interfaces:** Consumes stored conversations and `handleTurn`; produces `requireStaff(request)` and `requireAdmin(request)` request guards; `pruneTranscripts(now):Promise<number>` removes messages older than 30 days without storing verification codes or full transcripts in audit metadata.

- [ ] Write browser tests asserting fixture banner, saved conversation detail, accessible keyboard navigation, narrow-screen layout, administrator-only settings, and callback capture. Add retention tests at 30-day boundaries and manual deletion tests.
- [ ] Run `npm run test:browser -- tests/dashboard.spec.ts` and focused retention tests; confirm expected failures.
- [ ] Implement overview, history, test screen, settings, readiness, deletion and protected cleanup endpoint. Default audio recording off; redact codes/secrets before persistence. Keep simulator authority controls strictly fixture-only.
- [ ] Run PostgreSQL retention tests and browser smoke against the running app; restart the app and confirm history/settings survive. Run typecheck/build. Document exact install/start/readiness steps and fixture limitations.
- [ ] Commit as `feat: add receptionist dashboard and simulator`.

**Phase A exit:** Independently usable local fixture demonstration; no claim of connection to real tickets or live calls.

## Phase B — Secure repair integration

### Task 4: Repair-service authentication, verification and staff grants

**Files:** In repair repository create `lib/receptionist/{auth,verification,grants,schemas}.ts`, `app/api/integrations/receptionist/v1/{business,challenges,verify,authorize,token}/route.ts`, `app/integrations/receptionist/authorize/page.tsx`, corresponding `lib/receptionist-*.test.ts`; modify `prisma/schema.prisma` and create an additive migration.

**Interfaces:** Exposes shared contract over versioned HTTPS routes with a dedicated machine credential. Authorization uses server-stored random single-use codes, redirect URI allowlisting, state and PKCE, five-minute code expiry, and 15-minute revocable staff grants. Customer challenges use six-digit cryptographically random codes, HMAC hashes with a dedicated secret, five-minute expiry, five attempts, and per-ticket/contact/IP send limits (three per 15 minutes). Verification grants expire after 15 minutes and bind ticket and conversation. Responses do not distinguish absent tickets from failed delivery to unauthenticated callers.

- [ ] Reinspect repair HEAD, instructions, auth, notification and customer-release modules; record any incompatible changes and adapt filenames before editing. Preserve source app behavior.
- [ ] Write tests for machine auth failure, unknown-ticket enumeration resistance, wrong/expired/replayed code, delivery unavailable, send limits, conversation binding, state/PKCE/redirect failures, grant revocation and location restrictions.
- [ ] Run `npm test` with repository runner selecting the new suites as supported; confirm intended failures.
- [ ] Implement additive persistence and routes using existing staff/customer domain identity; deliver codes only through the registered contact channel. Store credential digests and grant hashes; never return secrets in public routes or logs. Require HTTPS except loopback development.
- [ ] Run new tests plus existing customer-auth and staff-access suites, migrate/reapply on disposable PostgreSQL, and confirm public/private field allowlists and role revocation against the actual database.
- [ ] Commit repair changes as `feat: add scoped receptionist authorization API`.

### Task 5: Repair-service transactional booking and status actions

**Files:** In repair repository create `lib/receptionist/{operations,tickets,booking,actions}.ts`, routes `.../v1/tickets/route.ts`, `.../v1/bookings/route.ts`, `.../v1/actions/route.ts`, `.../v1/operations/[id]/route.ts`; add operation/audit/version fields via additive migration; add PostgreSQL integration suites.

**Interfaces:** Implements `ticket`, `book`, `changeStatus`, and `operation` contract. Idempotency is scoped to integration identity and operation ID; repeated key with different input returns CONFLICT. Mutation and audit success commit together. Expected version compares under the same write lock used by the existing repair domain.

- [ ] Write failing database tests for duplicate/concurrent booking, stale intake revision, missing consent, cross-customer reads, unreleased checkout fields, wrong-location staff, stale versions, audit rollback, terminal-ticket changes and duplicate operations with changed payload.
- [ ] Run new PostgreSQL suites and confirm failures.
- [ ] Implement writes through existing booking/intake/checkout/cancellation functions. Refactor only as needed to share transactional primitives without changing their existing semantics. Never assign status directly from an AI request. Reject intake/checkout transitions with missing required records; return a repair-app link for staff completion.
- [ ] Run new integration tests plus existing booking concurrency, notification, intake/checkout and customer-ticket suites. Assert exactly one booking and one success audit for duplicate operations; no private fields leak and no existing workflow changes.
- [ ] Commit repair changes as `feat: add audited receptionist repair operations`.

### Task 6: Connected receptionist and two-app validation

**Files:** Create `src/repair/http.ts`, `src/auth/{exchange,session}.ts`, auth callback routes, `tests/repair-http.test.ts`, `tests/two-app.integration.test.ts`, `tests/connected-dashboard.spec.ts`; update runtime configuration, dashboard and README.

**Interfaces:** HTTP adapter implements `RepairService`; application sessions contain server-held grant references, use secure HTTP-only cookies and CSRF protection for mutations. Reads have a five-second deadline and at most two retries with bounded backoff. Writes never retry with a new operation ID; timeouts return UNCERTAIN pending reconciliation.

- [ ] Write tests for malformed/credential-bearing upstream responses, unknown states, wrong content type, timeout, disconnect after commit, session fixation, cross-site mutations, revoked grants and fixture-to-connected leakage.
- [ ] Run focused suites; confirm failures.
- [ ] Implement server-only credential use, strict schema projections, safe error mapping, callback validation, user session rotation and scoped authorization. Require an administrator to change service settings; validate service URL against configured deployment origin to avoid arbitrary network requests.
- [ ] Run both apps on separate ports and separate test databases. Execute real verification via a captured development delivery transport, booking with duplicate operation IDs, authorized staff change, customer denial, logout/revocation and source outage. Browser smoke proves connected sign-in, ticket result, booking result and audited change. Do not use mocks for this exit check.
- [ ] Run builds/typechecks for both repositories, save tested setup/start instructions in the environment draft, and commit as `feat: connect receptionist to repair software`.

**Phase B exit:** Connected local workflow verified against both applications. Production configuration and deployment remain outstanding.

## Phase C — Model and voice adapters

### Task 7: Server-side AI and signed phone webhooks

**Files:** Create `src/providers/{model,openai,twilio}.ts`, `app/api/voice/{incoming,turn,status}/route.ts`, `src/voice/{sessions,transfer}.ts`, `tests/providers.test.ts`, `tests/voice.integration.test.ts`; extend persistence for webhook deduplication and call pairing.

**Interfaces:** `proposeTurn(messages,allowedTools):Promise<Proposal>` generates an untrusted structured proposal passed to task 2 authorization. `handleVoiceWebhook(request):Promise<Response>` validates signature against configured canonical external URL, deduplicates event IDs, maps call to conversation and emits TwiML. Use Twilio speech gather plus server-generated responses for first version; streaming audio is outside this plan. `pairCall(staffSession,callId):Promise<void>` requires authenticated session, one-time pairing confirmation from that call and bounded expiry; pairing never replaces repair-service authorization.

- [ ] Write tests for invalid signatures, proxy URL mismatch, repeated/reordered webhooks, malicious model tool proposals, unpaired staff write, interrupted/duplicated turn, no transfer destination, uncertain write during disconnect, and absent provider credentials.
- [ ] Run focused suites; confirm failures.
- [ ] Implement provider adapters with finite deadlines and no raw secrets in model input. Disable recording, require pairing for staff call actions, confirm writes explicitly, transfer only to configured destinations and offer callback capture on failure. Calls disclose AI identity; never read codes/passwords/internal notes back in summaries.
- [ ] Use signed local webhook requests and mocked external provider transport to verify TwiML response, deduplication, role enforcement, transfer/fallback and operation reconciliation. Verify conversation and tool audit persist after hangup. Run full local tests/build/typecheck.
- [ ] Commit as `feat: add AI and phone provider adapters`.

### Task 8: Repeatable setup and readiness handoff

**Files:** Update `.env.example`, `README.md`, deployment/runbook documentation and environment configuration draft; add `tests/readiness.spec.ts` only for uncovered end-to-end assertions.

**Interfaces:** Readiness reports separately: fixture usable, repair connection verified, phone adapter locally verified, real inbound call verified. Missing credentials or deployments cannot be reported as passing checks.

- [ ] Test readiness checks fail for missing service URL, machine credentials, staff auth, provider binding, public webhook origin and transfer destination; disconnected modes remain explicit.
- [ ] Reexecute frozen install, migrations, startup and representative functional requests in documented directories. Repeat migrations and restart only services started for this task. Check tracked/untracked changes for unintended generated modifications.
- [ ] Save complete tested `install_script` and `start_skill` through environment configuration tooling, preserving existing requirements. Check binding presence without printing values; add only missing supported requirements. Raw database credentials and locally used signing secrets require secure runtime variables rather than proxy placeholders. Do not place reserved provider variable names into unsupported secret fields.
- [ ] Report passing tests with counts and diagnosed failures. Provide the separate repair-repository change for review without publishing or deploying either app.
- [ ] After the user separately arranges deployment and provider accounts, run a real inbound call covering AI response, verified ticket lookup, booking or staff action, and transfer/fallback. Until then explicitly mark this live-call acceptance check unrun.
- [ ] Commit documentation as `docs: document receptionist setup and readiness`.

## Plan self-review

Coverage: tasks 1–3 cover persistence, dashboard, fixture conversation and retention; tasks 4–6 cover verification, staff identity, business data, booking, state changes, auditing and two-app integration; tasks 7–8 cover providers, fallback, reproducibility and honest live-readiness reporting. Every Review Focus case has an owning test task. Shared signatures are defined once; adapters implement the same contract. No implementation, deployment, paid provider operation, or production data change is authorized by merely writing this plan.
