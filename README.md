# Frontdesk — AI repair receptionist

A receptionist workspace for one repair business and its locations. It includes a dashboard, persisted test conversations, source-grounded repair questions, confirmed booking, verified ticket lookups, authenticated staff cancellation, and signed phone adapters.

## What is verified locally

Fixture mode uses fictional stores and tickets; it never creates a real appointment or sends a text. Connected mode uses a separate development copy of `irepairsmartdevices-debug/shopify-phone-repair-booking` and its own PostgreSQL database. Both apps communicate over a scoped HTTP API; the receptionist does not read the repair database.

Live calls, real verification texts, and real AI-provider requests require separately configured accounts and deployment. No phone number was purchased, no production database changed, and neither application was deployed.

## Local setup

Use Node.js 22 or later. The managed cloud checkout already has installed dependencies and local configuration. From this repository:

```sh
npm ci --cache /tmp/receptionist-npm
npm run db:local
```

Keep the database process running. In another shell, configure the local development files if absent, migrate, and start:

```sh
node scripts/configure-local.mjs
npm run db:migrate
npm run dev
```

The development server binds to loopback port 3000. `db:local` starts a loopback-only embedded PostgreSQL 18 cluster at port 55432, retained in `/workspace/.receptionist-db`. It creates the `receptionist` and `repair_integration` development databases. Its fixed local development password is not suitable for a deployed database. Stop/start only this process to manage this cluster; do not assume processes survive environment publication.

Use the existing checkout in this isolated cloud workspace. Do not create another worktree unless explicitly requested.

## Test the receptionist

Open the test-conversation page in the application. Ask about hours, screen pricing, a ticket, or booking. Fictional ticket `1001` begins confirmed; the demo verification code is `123456`. Select the explicitly labeled demo-staff role to exercise confirmed cancellation. Intake and checkout transitions must be completed through the repair software with their required information and photos.

Messages and settings persist in PostgreSQL. Verification codes are redacted. Text retention is 30 days; deletion is available on the conversation detail page. Audio recording is disabled.

## Connect the repair software locally

The integration change is developed on branch `codex/receptionist-integration` in the separate repair checkout at `/workspace/shopify-phone-repair-booking`. Its base is `ed1350abc9df14f365347679b13142bf29dfbd82`. A reviewable patch is also retained in `docs/integration/repair-api.patch`. Apply/review the change in the other Codex environment before deploying that project; changes here do not automatically update another environment or GitHub.

The local configuration helper creates matching random development API credentials without printing them, only when configuration is absent. Existing configuration is preserved. In the repair checkout:

```sh
npm ci --cache /tmp/receptionist-npm
npm run db:migrate
npm run db:seed
npm run build
npm start -- --hostname 127.0.0.1 --port 3001
```

Only seed the disposable local development database, never an existing production database. In the receptionist checkout, use the same machine credential, set `REPAIR_SERVICE_URL` to the repair origin, `APP_ORIGIN` to the receptionist origin, and `RECEPTIONIST_MODE=connected`. Start/restart the receptionist. Sign in to the repair app using your configured local administrator account, then use the receptionist's **Connect repair account** flow. Authorization expires after 15 minutes and is checked against the repair app on requests. Settings require administrator access. Customer conversation mode never receives staff authority.

The repair app requires `RECEPTIONIST_API_TOKEN`, `RECEPTIONIST_ORIGIN`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `APP_URL`, and its own `DATABASE_URL`. Use separate credentials and databases for development and production. Existing customer login does not replace the receptionist verification flow: a code must be delivered to the ticket's registered contact, and the resulting grant is scoped to that ticket and conversation.

## Validation

With the local PostgreSQL process and the repair app on port 3001:

```sh
npm test
npm run test:integration
npm run typecheck
npm run build
```

Stop the receptionist before building: Next development and production processes must not write the same `.next` output concurrently. For fixture browser checks, start the production build in fixture mode and run `npm run test:browser`. Chromium can be selected using `CHROMIUM_PATH`; the cloud default is `/usr/bin/chromium`.

For the connected browser check, start the receptionist with `RECEPTIONIST_MODE=connected`, then run `TEST_MODE=connected npm run test:browser`. `REPAIR_CHECKOUT` selects the source checkout if it is in another directory. The integration fixture helper refuses production or remote databases; it creates fresh disposable tickets and development grants. Test output never prints these credentials.

Run the repair app's `npm test` and `npm run build` from its own checkout. Do not reuse the receptionist database URL for repair tests.

## Phone and model configuration

Configure an HTTPS deployment and `VOICE_PUBLIC_ORIGIN` with its canonical origin. Point Twilio's incoming voice webhook to `/api/voice/incoming` and status callback to `/api/voice/status`, using POST. `TWILIO_AUTH_TOKEN` must be the actual secure runtime value because webhook signature validation happens locally; a proxy placeholder is insufficient. Set `TWILIO_ACCOUNT_SID` and `TWILIO_FROM_NUMBER` for verification delivery in the repair app. Do not put credentials in browser variables or chat.

`AI_PROVIDER_KEY` is the receptionist's server-side OpenAI credential name. Model output proposes a bounded intent; tool authorization, confirmation, and source-grounded responses remain deterministic. Set an optional `TRANSFER_NUMBER` in E.164 format or manage the transfer destination in settings. Without an available staff destination, capture a callback request rather than inventing an answer.

A staff caller must pair the signed call to an authenticated dashboard session before voice status changes. Say “pair staff”, then enter the short-lived pairing code on the dashboard's Calls page. Call pairing never bypasses repair-app role, location, version, confirmation, or domain workflow checks.

Network destinations: `binaries.prisma.sh` for the repair app's verified Prisma engine; standard npm/GitHub package destinations; `api.twilio.com` and `api.openai.com` for optional live providers. TLS/checksum verification remains enabled.

Before calling the phone feature ready, separately verify a real inbound call, delivered customer verification, a confirmed repair operation, and transfer/fallback. Local signed-webhook tests do not prove a live call works.

## Retention worker

Run `npm run retention` alongside the server. It removes expired transcript text, abandoned conversation state, voice response caches and callback data hourly while retaining minimal operation audit metadata. `npm run retention -- --once` runs one cleanup pass. Register this worker or an equivalent scheduled job in the deployed environment; a web server process alone does not schedule cleanup.

## Admin-only hosted demo (Vercel)

The hosted demo uses fictional repair data and has one administrator login, without staff accounts.
In Vercel → Environment Variables, set these for **Production**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your existing Neon connection string (keep private) |
| `RECEPTIONIST_MODE` | `fixture` |
| `APP_ORIGIN` | `https://ai-phone-receptionist-five.vercel.app` (or your canonical HTTPS domain) |
| `DEMO_ADMIN_PASSWORD` | A private six-digit PIN or password of at least 16 characters |

Redeploy after changing environment variables. Open the canonical site address, sign in as admin,
then use Test receptionist. Preview/deployment-specific URLs are not the configured mutation origin.
Do not share the password in chat or commit it. Sessions expire after eight hours; Sign out revokes
the session immediately. Changing the password revokes earlier demo sessions after redeployment.
The login has a shared database limit of 30 attempts per 15 minutes; wait if limited.
No additional tables are needed beyond migrations 001 and 002. Demo access never authorizes the
connected repair service or live calls. Connected mode requires a repair administrator account.

## Custom answers and device-specific estimates

Open **Knowledge & pricing** in the admin panel (or Settings → Open Knowledge & pricing).
Add a question, approved answer and optional alternate phrasings, then save. Edit and delete controls
apply on the next conversation turn; deleting does not remove earlier transcript history.
Exact saved questions, alternate phrasings and common repair-word equivalents (such as fix/repair and water-damaged/water damage) work without an AI key. Set server-only `AI_PROVIDER_KEY`
for semantic matching of other phrasings. The provider selects a saved answer ID; the receptionist
returns your approved answer. Ambiguous matches ask for clarification rather than inventing an answer.

Add manual prices by device category, brand, exact model and repair type. Enter amounts in USD.
The assistant asks for missing device/model/repair details before quoting one matching estimate.
Unknown models and unavailable prices lead to a callback offer. Manual estimates do not create
bookable services or change repair-app appointment totals.

The catalog list shows demonstration entries in fixture mode and current repair-software entries
in connected mode. To replace one informational source estimate, explicitly select it in the
manual-price override field. Delete the override to restore the source estimate. Unlinked manual
entries never silently override a matching source offering. A linked estimate is unavailable when
its source offering disappears; standalone manual entries remain usable during a source outage.

Both test conversations and configured connected voice use this knowledge. No extra database
migration is required: records use the existing `settings` table. Connecting real catalog prices
still requires deploying the separate repair integration. Its retained commit is
`2b396fd9e1e30bdccbd17a0a860cfc4cb6cef8e2`; the updated portable patch is in
`docs/integration/repair-api.patch`. Older source APIs are accepted, with conservative clarification
when category/brand metadata is missing.

### Automatic repair-catalog updates

In connected mode, each pricing question and follow-up reads the current repair-app catalog with
caching disabled at both ends. Saving a source price change or adding a model with an assigned repair
and price is reflected on the next question; no receptionist redeployment or manual reimport is needed.
A model without a configured repair price cannot be quoted. An explicit linked manual override stays
in effect until removed. The administrator catalog list refreshes on page reload/navigation; an already
open list does not poll, while conversation turns still read current data.

Regression `tests/catalog-freshness.integration.test.ts` verifies a source price change, a new model
and offering, and removal using the same HTTP client and conversation engine without restarting.

## Adaptive conversations and store directions

The test receptionist and configured voice flow now share context-aware intake. A personal report such
as “My device is wet” starts a conversation about missing device/model and useful symptom details.
Already supplied details and corrections are retained across turns and reloads. Ordinary policy questions
still use your saved answers. With `AI_PROVIDER_KEY` configured, the AI selects relevant approved facts
and supported natural follow-up questions; deterministic intake remains available during provider outages.
The assistant offers a repair visit or callback when it has enough information. A yes to an actual offer
starts the normal booking process; an appointment still needs the existing review and confirmation.
Prices, private tickets, status changes and booking confirmations remain under their existing workflows.
AI/customer dialogue never rewrites your prices or policies.

In **Settings → Store directions**, add/edit the location name, full address and landmark directions.
Dallas initially has the owner-provided note: “Across from RedBird Mall, in the same complex as Hair Depot.”
Its street address stays blank until the administrator supplies it. Enter the real address before using
directions with customers. An optional repair-location link uses that location’s current source address;
landmarks stay editable here. Cleared or unavailable linked addresses never reuse an old copied address.
The receptionist asks which store when needed, remembers the selection, and supplies exact saved facts
plus a Google Maps directions link when an address is known. It does not invent travel times or routes.
The address can interrupt a repair conversation without losing the device context or ticket verification.
No extra migration or new secret name is required.
