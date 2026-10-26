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
