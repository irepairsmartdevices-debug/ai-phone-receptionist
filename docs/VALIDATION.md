# Local validation and handoff

The first local version implements the approved design's development workflow. It is not deployed, and real phone calls, delivered SMS codes and paid model requests remain unrun pending provider accounts, HTTPS deployment and secure credentials.

## Verified capabilities

- Dashboard, fixture simulator, persisted history, settings, callbacks, manual deletion and an hourly retention worker.
- Source-grounded business answers and appointment collection using the source app's slots and revisioned, offering-specific intake questions.
- Registered-contact verification with a conversation/ticket-scoped grant; no caller-ID-only access.
- Browser staff authorization with state, PKCE, single-use codes and short-lived grants. Confirmed cancellations are staff-only, version checked, idempotent and audited. Intake and checkout status transitions remain in the repair app with their required information and photos; there is no unrestricted status setter.
- Two separate local applications and PostgreSQL databases. Integration tests use the actual repair API rather than substituting fixture success for a real operation.
- Signed phone webhook validation, duplicate delivery handling, staff call pairing, grounded model intent proposals and callback fallback. Live provider connectivity is not established by those local tests.

## Evidence

- Receptionist suite: 29 tests passed, including both-app HTTP, PostgreSQL, authorization, confirmation, retention, lost-response/restart recovery, DST selection and signed voice webhook cases.
- Repair app suite: 278 tests passed. Its production build passed; existing CSS/Prisma adapter warnings do not change those test outcomes.
- Production builds and receptionist type check passed.
- Two fixture browser tests passed (desktop conversation persistence and mobile usability). One connected browser test passed (staff authorization through both apps, confirmed local ticket cancellation and authenticated call pairing).
- Frozen installs, repeated migrations, seed setup, server stop/start and PostgreSQL readiness were exercised. The local repair administrator login was verified without printing credentials. Test fixtures preserve existing administrator credential records.
- The development configuration generator preserved existing files; retention cleanup ran successfully as a one-shot job and as a running hourly worker.

## Review and fixes

One fresh reviewer assessed both repositories. All seven reported findings were fixed in a single regression-tested pass: pending-operation recovery, complete transcript-bearing retention cleanup, atomic voice state/cache updates, zero-question booking, runtime use of saved settings, unsuccessful-transfer fallback and replay of committed bookings after intake revision changes. A browser check additionally caught the mobile navigation overflow after adding Calls; wrapping navigation fixed it. No reviewer findings were deferred.

## Decisions and costs

1. Cloud skill helper scripts were not executable filesystem resources, so execution progress used a local ledger. Cost: manual bookkeeping.
2. Work stayed in the existing isolated checkout. Cost: none; no extra worktree was needed.
3. A blocked verified Prisma download initially prompted a parameterized PostgreSQL implementation in the receptionist. The download later became available and the repair app uses its existing Prisma setup. The temporary duplicate receptionist schema was removed. Cost: the two apps use different persistence libraries.
4. Real ticket versions use the repair app's SHA-256 version digest; fixtures retain integer versions. Cost: integration clients accept digest strings as well as fixture integers.
5. Intake questions come from the selected offering and source revision rather than a fixed power-on question. Cost: fixture datasets must define every question they exercise.
6. The repair checkout is retained under `/workspace/shopify-phone-repair-booking`; an earlier temporary inspection copy was preserved after a cross-filesystem move could not remove its cache. A fresh frozen install and all required checks succeeded at the retained path. Cost: temporary disk usage, with no user work removed.

## Repository and publication boundaries

The receptionist work and the repair integration are local Git commits. They have not been pushed or merged into GitHub or the other Codex environment. The repair change is on `codex/receptionist-integration`, based on `ed1350abc9df14f365347679b13142bf29dfbd82`, with a portable review patch at `docs/integration/repair-api.patch`.

The environment configuration draft records installation/startup instructions and both retained repositories. Saving a draft does not publish or deploy it. Fresh-task restoration of these local-only commits has not been verified; the platform documents limitations restoring unpublished local commits. Retain the patch and commit history and review the snapshot before relying on a new task.

For live readiness, deploy both reviewed apps, configure the secure machine connection, Twilio, the AI provider and canonical HTTPS webhook origin, then verify a real inbound call, delivered customer verification, a confirmed operation and transfer/fallback. No production database migration, phone-number purchase or deployment was performed here.


## 2026-10-26: Custom answers and exact-model estimates

Admin knowledge CRUD uses individual namespaced settings records, existing administrator sessions and
mutation-origin protection. Q&A variants and conservative lexical matching work without an external
provider. Optional semantic matching selects a current saved answer ID only. Manual entries and
explicit linked quote overrides never create source offerings or change source booking totals.
Browser and connected voice load current knowledge each turn; original caller model details are preserved.

Verification: main Node tests 61/61; source tests 279/279 and source TypeScript passed; main production
build and TypeScript passed. Production browser checks cover administrator Q&A and price CRUD at 1440px
and 390px, anonymous/cross-origin denial, immediate edit/delete reply changes and existing admin logout.
Source patch applies cleanly to original ed1350a base. Real provider semantic calls, real phone calls,
and a deployed repair-service connection remain unverified/unconfigured here.

Review regressions: changing an earlier screen request to unsupported camera repair cannot reuse the
screen price; repair names on another model cannot cause a clarification loop. Both failed before the fix
and passed afterward. Source price changes after booking review remain an existing source contract
limitation; all prices are estimates, not a price lock.

## Automatic source catalog freshness

Verified end-to-end against the dedicated local repair integration database and running HTTP endpoint:
source estimate $111.00 changed to $143.75 and the same engine returned the new amount; a new model
with a $207.00 repair offering became quotable without restart; removing its offering stopped that quote.
The test only creates and cleans up its own local catalog rows. An unpriced model is intentionally absent.
Fetch and endpoint no-store policy were independently reviewed. Explicit manual overrides retain precedence;
already-open admin catalog lists need a reload, while pricing turns fetch current data independently.

## Water-damage FAQ wording regression

Reproduced the reported generic response using saved question “Do you repair water-damaged phones?”
and customer input “do you fix water damage devices”, with no provider key. Literal token overlap
missed fix/repair, damaged/damage and generic device/phone wording. Added a bounded FAQ-only
canonical vocabulary and strict core-token equivalence, preserving the existing fuzzy threshold.
The responder still returns only stored approved answers. Guards prevent widening a phone-only
FAQ to laptops or mixed phone/laptop requests; numeric models, variants, negation and policy intents
remain distinct. Generic devices with multiple matching device-specific answers ask for clarification.
Regression cases were observed failing before fixes and passing afterward. No pricing matcher or
business facts were changed. A production browser regression saves a differently worded FAQ with no
exact alternate and tests the reported customer wording through the live local API.
Verified after final fixes: Node suite67/67, production knowledge browser suite4/4 (desktop/mobile CRUD,
access checks and screenshot-wording regression), TypeScript and production build all passed.

## Adaptive dialogue and grounded store directions

Added shared test/voice orchestration with bounded redacted conversation memory, current device/model/issue
corrections, context-aware booking offers and one useful follow-up at a time. AI plans are structured and
validated; questions use supported observational forms, and business facts come from current compatible
saved records or the existing source engine. Default Dallas landmarks were explicitly supplied by the owner;
no street address was supplied or invented. Admin directions use a revisioned settings record and optimistic
conflict checks. No database migration or live-phone deployment is part of this change.

Review regressions cover stale model plans, numeric substring model mismatches, changed device family,
negated/replaced issue, device-incompatible policies, unapproved claims in generated questions, similarly
named locations, direction-selection interruptions of verification, and missing/cleared source addresses.
All were reproduced before their fixes. Root also reproduced/fixed stale model memory after a pricing
clarification, and added a stable accessible label for saved landmark notes after a browser reload.

Live provider behavior with the user’s production key is not accessible from this cloud environment;
provider contracts/error paths are tested with structured HTTP fixtures. Real provider and phone acceptance
must be checked in the deployed app. No source repair-app changes were needed for this feature.
Final verification: Node suite94/94; production browser suites10/10 (adaptive4, knowledge4, admin demo2),
TypeScript and production build passed. No user street address was supplied while building; default Dallas
notes contain only the supplied landmarks, and the admin form is ready for the full address.


## Named call topics and multiple trigger phrases

The owner chose custom written replies for topics such as Store Location. Topic names
are optional bounded metadata on existing saved-answer records; original records load
unchanged and every answer remains required. The admin example fills questions and
phrases but leaves the answer blank, with an explicit save required. No migration or
production knowledge edits were made.

Regressions verify multiple triggers, custom location text ahead of built-in directions,
next-turn edits/deletion, conflicts, preserved repair context, guarded codes/pricing and
booking offers, and provider-selected known IDs. A signed webhook test exercises multiple
phrases, editing and deletion across phone-call turns. The fresh reviewer identified a
stale public store-choice flag after topic replies; its regression failed before the fix
and passed for both literal and semantic matching. Browser checks exposed unstable
textarea accessible names after editing; explicit labels now keep those fields addressable.

Real deployed OpenAI requests and live Twilio calls remain unverified from this environment.

Final verification: Node suite107/107; production browser suites10/10 (knowledge6,
adaptive4); TypeScript, production build and diff checks passed.


## Hosted repair-service connection preparation

Ported the source integration onto current repair main811fcb1 and published it as
source commita44e20c, preserving current catalog/time-clock changes. Refreshed the
portable patch against that new base and added a production connection guide.
Fixed cross-site Strict-cookie administrator authorization with an explicit
same-origin continuation, and included the integration migration in both source
SQL bootstrap bundles so repeated deployments remain valid.

Verified: source297 Node tests; SQL bootstrap QA5; production Vercel upgrade,
Prisma migration verification and Next build on a separate disposable database;
source TypeScript and synthetic Strict-cookie browser checks. Receptionist
integration suite5/5 passed, including changed prices/new models/removals and
verified-ticket authorization. The updated connected browser regression passed
actual localhost-to-127.0.0.1 administrator authorization, explicit cancellation
of its disposable local ticket, and call pairing. No production data was changed
by tests. The owner's live repair URL and private hosting variables were not
available, so a hosted connection is not yet claimed.

Final receptionist checks: Node107/107 and TypeScript passed. The refreshed
portable patch applies cleanly to its documented811fcb1 base. Patch context
whitespace is preserved as required by the unified diff format.


## Connected sign-in diagnostics and pending-cookie cleanup

The live screenshots showed a completed repair approval followed by the former
silent authorization error. Hosted settings and the actual failure were not
accessible to this cloud task, so no successful live fix is claimed. Added static
allowlisted sign-in messages and enum/status-only logs for pending-cookie/state,
configuration, machine credential, authorization, response/network, administrator
role and session-storage failure stages. The source token endpoint now supplies a
distinct failed-machine-authentication code without changing other endpoints.

Regressions observed the generic failure and ignored sign-in error before changes.
The callback now clears pending cookies at `/api/auth`, preserving a newer cookie
when an older callback has a different state. Tests reject all failure cases without
creating a session, preserve successful administrator authorization and verify no
keys/codes/verifiers/grants/raw errors are logged or reflected. Malformed-origin
fallback and fixture-mode compatibility regressions were also verified red/green.

Final verification: receptionist Node115/115; repair Node299/299; both production
builds and TypeScript passed. Actual local token requests distinguished a wrong
machine credential from a rejected code. Connected production browser suite2/2
passed across separate local sites, including correct cookie removal, explicit
local-test cancellation and an expired callback displaying its reason. A fresh
hosted attempt after deployment is still needed to identify the owner's live cause.


## Gemini receptionist upgrade

The owner selected Gemini and approved the written design. Implemented selected-provider
REST transport, explicit observational memory, safe question goals/styles, semantic
pricing/directions routing, current catalog identities, and administrator-only AI checks.
No repair database/schema, repair credentials, or staff access changes were made.

Final release verification:

- `npm test`: **164 passed, 0 failed**. Includes Gemini contract, grounded dialogue,
  exact custom topics, signed voice integration, readiness and existing regressions.
- `REPAIR_CHECKOUT=/workspace/.worktrees/repair-receptionist-connect npm run test:integration`:
  **5 passed**, including source price/model freshness, verification, booking
  idempotency, signed voice deduplication and transactional recovery.
- `TEST_MODE=gemini PLAYWRIGHT_BASE_URL=http://localhost:3002 npm run test:browser`:
  **3 passed** against the production build: administrator/origin guards, real UI
  connection-check/cooldown/persistence, multi-turn simulator/reload, and mobile layout.
- `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
- Independent provider/readiness and whole-branch reviews completed. Review fixes
  were reproduced RED then GREEN: private workflow history isolation, stale model/repair
  invalidation, exact Fold/Lite/XL variants, and ordinary repair prose in model parsing.

Protected workflow replies and unmarked legacy history are not sent to the AI. Useful
structured public context survives. Unknown suffixes prompt clarification instead of
borrowing a shorter model's price. Owner-written topics remain exact.

Gemini transport and browser tests use synthetic provider responses; these results
do not prove access to the owner's Google model/account. No Google key was provided
to this workspace, and managed network policy does not permit the live Gemini host.
The deployed administrator **Test Gemini connection** action must pass after private
Production configuration and redeployment. Gemini generateContent is distinct from
Gemini Live audio; phone-number setup remains separate.

## 2026-10-28: Gemini connection-check timeout

The owner's deployed check with `gemini-flash-latest` reported a timeout. Code
inspection found the administrator check shared the eight-second conversation
deadline. A delayed nine-second transport reproduced premature check failure;
the regression failed before the fix and passed afterward. Gemini checks now
allow 30 seconds, while conversation requests retain the eight-second fallback.
The atomic check reservation is 45 seconds to cover completion, and the built
Next.js function manifest confirms a 60-second route duration allowance.

Verification: `npm test` passed 166/166; TypeScript, production build and diff
whitespace checks passed. A second RED/GREEN regression proves another check is
blocked at 31 seconds while the first is settling. Independent review found no
material issues. No automatic retry, provider fallback or credential disclosure
was added. The setup guide uses Google's documented Flash alias rather than
assuming a particular version is available to this project.

These checks use local synthetic transport. The screenshot alone cannot distinguish
the app's abort from Google's own timeout; a deployed connection check is still
required to establish live access. No live Google request ran in this workspace.

## 2026-10-28: First-attempt admin connection and Gemini diagnostics

Reproduced a first-fail/second-success authentication path with actual route
handlers and a Chrome cookie jar: starting on an alternate host stored the pending
cookie there, while the callback used the configured canonical origin. Auth starts
now move to the canonical origin before creating state or cookies, and auth
responses explicitly disable caching. Fresh canonical attempts passed 5/5; the
alternate-host first attempt failed before this fix and passed afterward. Cookie
flags, state/PKCE checks and administrator-only access are preserved. Failure logs
add only pending-cookie presence and origin-match booleans. This proves the host
mismatch bug, not the owner's unobserved original starting host.

The subsequent deployed Gemini timeout remained ambiguous: the app's deadline and
provider HTTP 408/504 previously shared one message. The admin check now records
bounded elapsed time, response phase, HTTP status and a safe failure source from
the existing single request. Optional connection codes use a fixed allowlist.
Test details persist across reload; legacy check records remain compatible, and
unknown stored diagnostic fields are stripped. No raw error, request URL/body,
credential, cookie or provider message is exposed. No retry or timeout increase
was added. Gemini's documented string/number enum restriction also led to removing
the check's boolean enum; local validation still requires the value `true`.

Verification: full Node suite 176/176; Gemini production-browser suite 3/3 using
synthetic provider transport, including Test details expansion and mobile layout;
production build and TypeScript passed. Independent review's body-error findings
were reproduced RED then GREEN, including a real local HTTP socket interruption
after headers. Interrupted transports remain distinct from invalid JSON/schema
responses even when their network code is not exposed. No material review findings
remain. Live Google account access and first-attempt production login still need
the owner's deployed checks; no live Google request ran in this workspace.

## 2026-10-28: Preserve safe Gemini request-rejection details

The owner reported successful plain-text Gemini 3.8 Flash output in AI Studio,
then a deployed HTTP 400 in 0.2 seconds using the same explicit model ID. Current
official Google REST/SDK references support the app's model, MINIMAL thinking,
temperature and JSON-schema settings; no additional contract mismatch was found.
The deployed rejection's cause remains unknown without its error details.

The existing bounded HTTP 400 body read now preserves only fixed provider status
codes, known ErrorInfo reasons and up to four known parameter hints. Arbitrary
messages, descriptions, field names and metadata are discarded. The admin panel
renders those safe details; this adds no request, retry, model or timeout change.
Other HTTP failures retain their existing fast classification and body handling.

Verification: three new regressions observed RED then GREEN; full Node suite
179/179; production build, TypeScript and whitespace checks passed. Local browser
QA against a synthetic HTTP 400 verified rendering, reload persistence, private
data omission and 390px layout. Review's optional-array TypeScript finding was
fixed before publishing, with no remaining material findings. Live API access
and the actual Google rejection still require the owner's next deployed check.

## 2026-10-28: Match the working Gemini 3.8 thinking setting

The owner's next deployed check returned HTTP 400 / INVALID_ARGUMENT and identified
the thinking-level setting. The app forced MINIMAL, while the owner's successful
Gemini 3.8 Playground test used MEDIUM. Requests for the exact `gemini-3.8-flash`
model now use MEDIUM in both connection checks and conversation planning. Other
model settings, token caps, deadlines and request counts remain unchanged.

A synthetic provider rejecting MINIMAL reproduced failure before the change and
accepted both check/planner requests afterward. Full Node suite 180/180, production
build, TypeScript and whitespace checks passed; independent review found no material
issues. Public documentation still broadly permits MINIMAL for Gemini 3 Flash, so
this is a scoped compatibility adjustment rather than a universal support claim.
The deployed API check and real multi-turn conversation remain to be verified.

## Gemini 3.8 Interactions compatibility (2026-10-28)

The owner's AI Studio export uses `client.interactions.create` with
`thinking_level: medium`. The deployed generateContent request last timed out at
its 30-second app deadline without response headers. Google's current cookbook
recommends Interactions and documents its structured JSON format; generateContent
is also documented for the same model, so the endpoint difference is not a proven
root cause.

The exact `gemini-3.8-flash` model now uses a stateless Interactions REST adapter
for both health checks and planning. It retains the 512/2048 output caps and
30/8-second deadlines, omits the prior temperature override to match the export,
and sends no tools, previous interaction ID, background work or automatic retry.
Other configured Gemini models and OpenAI retain their existing paths. Raw
completed model-output text is validated; thoughts are excluded and incomplete,
errored, nontext, tool, oversized or ambiguous responses fail closed. Public input
redaction and local approved-ID/plan validation remain in force.

Validation:

- Clean baseline: `npm test`, 180/180 passed.
- New Interactions tests failed against the prior endpoint/parser, then passed
  after the adapter change; success fixtures use raw REST `steps`, with no
  SDK-only `output_text` field.
- Final `npm test`: 186/186 passed, including simulated signed voice intake,
  public/private history boundaries, current catalog IDs, safe error diagnostics,
  and a real nine-second health response with the customer planner's shorter
  fallback.
- Production `npm run build`, separate `npm run typecheck`, and whitespace checks: passed.
- Independent adapter/API-contract review: no material findings; reviewer also
  ran the seven new tests successfully.

No real Google request was sent from this cloud environment. Live access with the
owner's private Production key still requires a fresh deployed connection check.

## Provider transport observations (2026-10-29 UTC)

The owner's fixed Interactions control completed in Google Colab with HTTP 200
in 4.75 seconds; the canonical deployed receptionist continued to time out at
30 seconds. The owner verified Production commit `56fd80b`. These observations
narrow the investigation but do not prove a transport or provider root cause.
Source inspection found no deterministic defect: Next 15 forwards the POST body,
headers and signal; the check route allows 60 seconds and releases its DB client
before starting the 30-second provider request.

The existing administrator check now observes native Undici diagnostic events,
correlated by async context and request identity. It records only a fixed last
stage and elapsed time, plus validated API/deployment/region/Node metadata. It
does not change fetch, timeouts, output budgets, selected provider, authentication
or customer planning, and does not send another request. Optional fields preserve
old stored results. Missing events remain inconclusive; a body-written event is a
client write, not proof of Google acceptance.

Validation:

- Clean baseline: 186/186 Node tests passed.
- New transport and persistence tests were observed failing before implementation.
- Full Node suite: 194/194 passed. Six real/synthetic transport tests cover normal
  POST milestones, a real abort before response headers, concurrent interleaving,
  pooled connections, observer failures/cleanup, and informational headers.
- Independent reviewer reran all six transport tests and 17 readiness tests;
  no material findings.
- Production build and separate TypeScript check passed; whitespace checks clean.
- Chromium against the local production build: synthetic transport/runtime facts
  rendered and survived reload; private values were omitted; 390px layout fit.

No real Google request was sent during validation. Production access remains
unverified pending a new deployed test with these observations available.

## Administrator check region comparison (2026-10-29 UTC)

Production commit `8d7fcd9` reported Gemini Interactions, Node 24.21.0, server
region `iad1`, and HTTP 503 after 5.3 seconds with response headers observed.
The app established a connection on that attempt; the existing evidence does not
identify why the service returned 503. The owner's earlier exact Colab control
completed successfully, which warrants comparing hosting paths without altering
the request payload, model, API key, transport, deadlines or response validation.

Only `/api/ai/check` now requests `preferredRegion = "sfo1"`. Customer chat and
voice route preferences remain unchanged. Next 15 documents this per-route
configuration and emits it in its function manifest; platform account-plan
validation remains external. No paid plan is enabled. The actual region shown in
a deployed check is required to interpret the comparison.

Validation: all 194 Node tests and the production build passed. The emitted
`.next/server/functions-config-manifest.json` contains exactly one region
override: `/api/ai/check` has `regions:["sfo1"]` and retains `maxDuration:60`.
Independent diff review found no material issues; whitespace checks passed.
No real Google request was sent, and deployment/region acceptance is unverified
until the owner observes the next Production build and check result.

## Correct Vercel Node function region configuration (2026-10-29 UTC)

The owner's Chrome and Brave screenshots show different checks, at 06:14:54 UTC
and 06:12:55 UTC, on commit `94ad48c`. Both still report `iad1`; one timed out
after the body was written, while the other received HTTP 503. These are not
evidence that the browser caused the provider failure.

Investigation found that Vercel's Next Node builder explicitly removes `regions`
from the Next function manifest. The earlier local manifest inspection therefore
did not establish deployment placement. Pinned upstream source:
`vercel/vercel@84878e532142f0ac584953695658b324eb9e5b80`,
`packages/next/src/utils.ts:2064-2093`. The builder supports Node function regions
through `vercel.json`'s `functions` source-file configuration instead.

The correction removes the ineffective `preferredRegion` export and adds one
exact function entry for `app/api/ai/check/route.ts` with `regions:["sfo1"]`.
Request body, credentials, provider/model, transport, deadlines and customer/voice
route configuration remain unchanged. Actual Vercel placement and Google
connectivity still require a deployed check; this does not prove a Google root
cause or guarantee account-plan acceptance.

The published `@vercel/build-utils@15.1.1` configuration resolver was installed
in a temporary directory with scripts disabled. Executing its real
`getLambdaOptionsFromFunction` selected `sfo1` for the exact check handler and no
region override for chat, voice or Settings. No application dependency changed.

All 194 Node tests and the production build passed. The Next manifest retains the
60-second check limit with no ignored route-level region export. Independent
final diff review found no material issues; whitespace checks passed. No real
Google API call was sent during validation.

## Retain safe Google 503 details (2026-10-29 UTC)

The owner's Production check on commit `313dfe2` confirmed `sfo1` placement but
still received HTTP 503 after 6.1 seconds. The region comparison did not resolve
the failure. Investigation identified an observability gap: the existing error
reader parsed HTTP 400 bodies but discarded all HTTP 503 bodies.

The reader now parses 400 and 503 using its existing 64 KiB bound and request
deadline. HTTP classification is unchanged; the key-rejection override still
applies only to HTTP 400. Existing allowlisted provider status/reason fields can
now survive a 503. New optional fields retain only a fixed content-type category
and a fixed high-demand hint when the bounded message contains Google's known
phrase. The phrase is present in the official cookbook at
`google-gemini/cookbook@b06b824cf2ea29f9543ffa14adcee68b5f934a9b`,
`examples/hybrid_file_search_and_google_search.ipynb`. This is a hint, not a
fabricated ErrorInfo reason or proof of the live failure's cause.

Validation: 201/201 Node tests passed, including six new error-body cases and one
DB round trip. Malformed/oversized and private bodies fail safely; interrupted
or aborted error-body reads preserve received HTTP/response-phase evidence.
The production build and separate type check passed. Independent review found
no material findings and independently reran all six error-body tests.

The update adds no requests, retries, credential changes, model changes, region
changes or deadline extensions. No real Google request was sent from the cloud.
Chromium against the local production build also passed: synthetic 503 status,
high-demand hint and content type render, persist after reload, omit private
values and fit a 390px screen. Whitespace checks passed.
