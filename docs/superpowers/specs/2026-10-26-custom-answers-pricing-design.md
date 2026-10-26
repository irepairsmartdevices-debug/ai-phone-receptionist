# Admin-managed answers and device-specific repair estimates

## Intent and approved direction
The owner wants admin-only add, edit and delete controls for custom questions and answers,
and a receptionist that asks for device and exact model before quoting a repair price.
The owner selected both receptionist-entered prices and prices read from the separate repair app.
Custom Q&A must recognize different ways of asking a question, rather than require exact wording.

## Approaches
1. Repair-app catalog only: avoids duplicate prices, but does not satisfy requested manual entry here.
2. Receptionist catalog only: works immediately, but disconnects later repair-app updates.
3. Both sources with visible origin and explicit overrides: selected direction. Repair-app entries are
   read from the current integration; receptionist owns additional entries and optional quote overrides.
   Overrides affect informational estimates only and never silently change repair booking prices.

## Administrator experience
Add a Knowledge & pricing area to the existing administrator workspace, using existing sign-in.
- Custom answers: question, optional alternate phrasings, approved answer; add, edit, delete with confirmation.
- Repair prices: device category, brand, exact model, repair type, USD estimate. Add, edit, delete manual entries.
- List repair-app entries separately, labelled Repair software; they cannot be deleted from this panel.
  A linked manual override is explicit, labelled, and removable to restore the live repair-app quote.
- Show saved/error states, validation, empty states and a test link. Controls work on mobile.
- Active admin content is used on the next conversation turn. Existing conversations do not retain deleted answers.
- No new staff accounts. No real calls enabled by this feature.

## Conversation behavior
For a price question, collect only missing details: device category/brand, exact model and repair type.
Remember details across turns. If the customer says an exact full model and repair initially, skip known questions.
Ask a clarifying question whenever multiple models or repairs match. Never conflate standard, Pro, Pro Max, Plus,
FE or Ultra variants. Do not print the entire catalog or quote an unrelated model.
Read the latest matching price when answering. Clearly call it an estimate, subject to inspection.
If no confirmed match exists, say a price is unavailable and offer a callback. No invented prices or completion times.
Show manual/repair-app source to admins; customers get a natural answer.

A structured price request takes priority over free-text Q&A. Q&A must not bypass verified-ticket access,
admin-only changes, confirmations, or booking workflows. Existing in-progress flows retain their state.
For ordinary business questions, match exact/alternate phrasings and conservative lexical matches first.
With AI configured, allow semantic matching to an existing answer ID only: the model cannot invent an answer,
change a price, supply unapproved facts, or authorize actions. Low-confidence/ambiguous matches ask for clarification
or offer a callback. Without AI, saved questions and variants still work; UI explains the semantic matching status.
Both test conversations and future connected voice use the same answers and pricing resolver.
Preserve original caller text during AI intent routing so model/device details are not discarded.

## Pricing source and booking boundaries
Connected mode reads current repair-app prices with no-store; manual entries are available immediately in demo.
Manually entered estimates do not write to the repair software or create bookable services.
An explicit linked manual quote override beats the corresponding repair-app estimate; otherwise the source
catalog remains authoritative. Duplicate local identities are rejected, and source IDs are preferred to name matching.
When a quoted manual estimate differs from a booking price, disclose and require review of the actual source
booking price. No claim that an unlinked manual offering is bookable. Existing booking confirmation remains required.
If the repair app is unavailable, manual entries may answer their own exact matches, but do not invent or silently
substitute cached live prices. Source catalog errors are visible to admins.

## Architecture and storage (builder choices)
Reuse Next.js, TypeScript, PostgreSQL and the existing settings table. Store each Q&A/manual price as its own
namespaced settings key with a server-issued UUID; per-record CRUD avoids overwriting unrelated concurrent edits.
Validate bounded strings, plain-text answers, finite nonnegative prices (integer cents), and duplicate identities.
Admin endpoints retain existing authentication and mutation-origin checks. No secrets in browser bundles.
A knowledge repository and pure resolver sit between stored content and the conversation engine. Catalog loading
combines manual entries with a validated repair Business response without weakening existing contracts.
Add optional hierarchy metadata (category/brand/model/service IDs and labels) to the repair projection and
receptionist schema; older repair endpoints continue to work conservatively without guessing unknown hierarchy.
Extend the retained repair integration checkout and patch as needed. That source app still needs its own deployment;
this feature does not claim it is connected or deploy it automatically.

## Validation
Cover admin CRUD authorization and origin checks; persistence across refresh; edits/deletions affecting replies;
paraphrases and ambiguity; missing-model follow-ups; direct full-model input; closely named variants;
unknown/removed prices; override restoration; provider outage; disconnected source; no privilege bypass;
manual prices never creating source services or changing booking amounts. Browser-test the admin add/edit/delete
and device-specific test conversation at desktop/mobile widths. Run full tests, typecheck and production build.

## Non-goals
No arbitrary workflow scripting, document ingestion, autonomous price generation, new phone deployment,
or changes to intake, checkout, payment or customer verification rules.
