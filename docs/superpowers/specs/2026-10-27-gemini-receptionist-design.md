# Gemini receptionist understanding and conversation

Status: owner approved ("go ahead"); implementation in progress.

## Intent and owner requirements

The owner selected Google's Astra/Gemini instead of the existing OpenAI account for
a more capable receptionist that understands customers and answers naturally.
The owner has confirmed that administrator authorization and live repair-software
prices now work. Preserve that connection and the existing custom knowledge.

The receptionist should understand paraphrases, remember device/model/problem
details and corrections, ask a useful missing question, and use current shop
information to answer. It must not repeatedly say "sorry that happened". The
administrator remains the only person who can edit knowledge or access the panel.
Named topics and trigger phrases use the exact custom answer the owner wrote.
Prices and new priced models come from the repair app on pricing requests.

## Approaches and selection

1. Upgrade the existing OpenAI model and conversation layer: reuses its configured
   credential, but does not meet the owner's explicit Google provider selection.
2. Add Gemini to the current shared chat/phone conversation layer: uses a Google
   API credential, retains the working repair integration, and improves text
   understanding and dialogue. This is the proposed implementation for the
   owner's selected provider.
3. Rebuild calling around Gemini Live bidirectional audio: enables real-time audio
   interaction but requires a separate telephony streaming architecture. It is a
   later project if interruptions or continuous audio become requirements.

Builder recommendation: approach 2, with structured Gemini interpretation and
natural observational questions. Do not describe a generateContent integration as
a separately verified Astra service or as a completed Live audio integration.

## Result the owner will see

- A customer saying "My phone took a swim" is understood as a liquid-damage
  conversation. The assistant asks for a missing device/model or relevant symptom
  and remembers details supplied in later messages.
- "It's a Pixel 9, happened yesterday, and the display is black" supplies several
  facts at once; it does not trigger another question asking for those same facts.
- "Actually, it's a different model" corrects context and prevents use of an old
  device's price.
- A price paraphrase such as "What would that run me?" uses the current device and
  repair context and enters the normal price-clarification/quote flow.
- The assistant answers a matching saved topic with the owner's exact approved
  wording, including custom store directions, without requiring every paraphrase
  to be typed into the admin panel.
- If the shop has not supplied an answer or price, the assistant says what is
  missing and offers the existing callback or booking flow.
- Settings identifies the selected provider/model and distinguishes a configured
  key from a successful connection check. The owner can test Gemini without
  exposing its key or sending a customer conversation as the test prompt.

## Provider and configuration

Use server-side Gemini generateContent REST with JSON structured output and local
schema validation. Use `x-goog-api-key`, never a key in a query string or browser
response. Proposed configuration:

| Variable | Meaning |
| --- | --- |
| `AI_PROVIDER` | `gemini` for the owner's deployment; absent keeps legacy OpenAI behavior |
| `GEMINI_API_KEY` | Private Google Gemini API credential, entered in Vercel Secret/Production |
| `GEMINI_MODEL` | Configurable model; proposed default `gemini-3.8-flash` |

The default model is a builder choice based on Google's current official cookbook
example. Actual availability for the owner's account must pass the live connection
check; do not claim that a mocked provider test verifies access. Preserve existing
OpenAI configuration for deliberate rollback; do not silently switch to it after
Gemini errors or change the repair-service keys, database, or authentication.

Centralize provider selection for dialogue planning and saved-answer matching.
Share it between the simulator and voice webhook. Bound input history, catalog
labels, output tokens, and request duration. Reject non-STOP/truncated, blocked,
empty, malformed or schema-invalid Gemini responses. Exclude thought parts from
parsed text. Do not retry repeatedly or make parallel model calls for one turn.
Use the deterministic fallback after an unavailable provider; expose only safe
error categories to the administrator, without raw provider responses or keys.

## Conversation design

Continue using the existing repair workflow engine as the source of quotes,
registered-contact verification, authorized changes, and confirmed bookings.
Gemini interprets customer intent and proposes the next conversational step; it
does not authorize or execute a repair-system operation itself.

Extend the bounded persisted dialogue context with distinct optional observational
slots, such as liquid involved, when the incident happened, and current symptoms.
Extract only details actually supplied by the customer; unknown remains unknown.
Keep compatible existing stored state and the explicit restart behavior. A single
answer such as "yesterday" must not falsely mark every symptom detail as known.
Preserve relevant device context across an intervening address or policy question.

Give Gemini bounded public catalog context (device/model/service names and IDs)
when interpretation needs it. Read the source afresh; never treat a model's number
as a quote or infer that an unavailable catalog price exists. Canonical catalog
references must be validated against current records, and an ambiguous or absent
model/variant requires clarification. Keep the existing manual-override rules.

Handle validated planner pricing/directions/hours intentions even when a customer
uses wording that does not match the current keyword patterns. Do not rewrite
active ticket verification, booking review/confirmation, or administrator-action
responses through a general chat model. Active private workflow fields and codes
remain within their existing workflow and are not sent to Gemini.

### Reply composition

Use typed reply parts rather than accepting an unrestricted factual paragraph.
Gemini chooses a relevant missing-information goal and a conversational style from
a bounded server-defined question registry, with optional validated device/model
references. The registry supplies several natural formulations for each useful
goal; the question sequence depends on the customer's actual details, not a fixed
script. This replaces the current model-written-question/regex-acceptance mismatch.
Server code inserts approved answers and authoritative workflow facts exactly.
Do not accept arbitrary model-written framing as a way to introduce business
claims, credentials, repair instructions, unsupported numbers, or completed actions.
If the proposed goal, style or reference is invalid, use a question for the actual
missing slot. Builder choice: prioritize more relevant, varied questions and
trustworthy factual answers over unrestricted generated prose in this upgrade.

Known slots are not requested again. Questions should usually ask one thing at a
time and sound like a repair receptionist. Acknowledgement is optional; no stock
sympathy prefix is added on every turn. Leave the owner's exact saved wording
intact. Price, address, hours, diagnosis, guarantee and completion claims come only
from approved/current server data, not newly generated Gemini business facts.

## Readiness and owner setup

Add an administrator-only connection check with the existing origin protection.
Use a small fixed structured request to the selected provider, validate its result,
and return only provider/model, checked/not-checked status, and a safe failure
category (missing key, rejected key, unavailable model, quota, timeout, response).
Bound checks to prevent accidental rapid repeated paid calls. A configured key is
not shown as a verified live connection until a check succeeds.

Deploy the code before guiding the owner through creating a Google Gemini API key
and adding the three production variables. Never ask them to paste the key into
chat. After redeployment, verify through the connection check and real simulator
examples. Live API costs and account/model availability remain the owner's Google
account settings; do not invent current rates or enable paid billing on their behalf.

## Validation before completion

- Provider contract tests: selected provider/key isolation, request/auth/schema,
  model configuration, thought exclusion, blocked/truncated/malformed outputs,
  quota/auth/model failures and timeout fallback, without key logging.
- Conversation tests: paraphrases, model names beyond the old hardcoded families,
  supplied multi-slot details, corrections, topic interruptions, unknown facts,
  paraphrased price intent, current price/new offering changes and exact-variant
  ambiguity, approved custom-topic wording, repeated-sympathy suppression.
- Protected-flow regressions: customer ticket verification, administrator-only
  changes, explicit booking confirmation and no prompt-granted privileges.
- Simulator/voice parity, readiness endpoint authentication/origin guards, and
  honest administrator connection status.
- Run relevant existing suites, typecheck, production build and independent
  review. Perform the live Google connection/simulator checks after the owner
  privately configures the key; distinguish these from mocked/local evidence.

## Scope limits and builder choices

No new staff accounts, database migrations, autonomous editing/training from caller
text, repair-app price edits, internet-sourced shop claims, camera/screen access,
or Twilio Media Streams/Live audio rebuild. Real phone service still requires its
separate number setup. The builder chooses module boundaries and test structure;
the owner has selected Gemini and retains control of saved answers and facts.

## Official API references checked for this proposal

- https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_Generate_Content.ipynb
- https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto
- https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/content.proto
- https://github.com/googleapis/js-genai/blob/main/src/types.ts
- https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_LiveAPI.ipynb

These public sources establish the request contract and example model names, not
successful live access from this cloud environment or the owner's Google account.
