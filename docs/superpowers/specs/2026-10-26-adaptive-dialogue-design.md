# Adaptive receptionist conversations and store directions

## Approved conversational design
The owner approved extending saved-answer selection into a conversation that remembers a customer's
device/model/issue and chooses relevant follow-up questions, then offers an inspection or repair visit.
They added directions: Dallas is across from RedBird Mall, in the same complex as Hair Depot.
The precise Dallas street address was requested separately; do not invent an address if none is supplied.

## Approach
Use an AI dialogue planner with persistent, bounded context and a grounded server renderer. The model
chooses an appropriate next question or workflow; saved answers and repair-service data supply business
facts. This fits the requested natural follow-ups and keeps existing verified-ticket/booking controls.
The existing engine remains responsible for prices, authentication, verification and confirmed actions.

## Conversation
- A customer saying their device got wet leads to a relevant device/model/details question rather than
  ending at the water-damage answer. Do not ask again for already supplied details; corrections replace old details.
- Retain device, model, issue and store choice across follow-ups and page reloads. Limit history and redact secrets/codes.
- With sufficient details, use relevant approved shop information and offer an appointment or callback.
- A yes to an actual booking offer starts the booking workflow; no appointment is created before its confirmation.
- Natural reply wording/questions may vary; model-generated questions must not assert prices, guarantees,
  unsupported diagnoses, completion promises, addresses, or dangerous repair instructions.
- Keep pricing and active ticket/booking/status flows authoritative. AI cannot authorize staff actions or bypass verification.
- Without an available AI provider, useful deterministic follow-ups and saved answers remain available, without
  pretending a model succeeded. Never return invented facts on timeout or invalid output.

## Directions and administration
Add a Store directions section to Settings for location name, full address, landmark/access notes,
and optional explicit link to a repair-app location. Administrator can add/edit/delete and save locations.
Default Dallas landmark text uses the owner's supplied description; the street address stays empty until configured.
Current source location addresses remain authoritative for linked stores. Display administrative validation errors.
A location question receives its exact saved/source address plus landmarks. Multiple possible stores require a
choice. Remember that choice. Provide a maps link when an address is available, without inventing travel times or
turn-by-turn guidance from an unknown starting location. If street address is missing, share known landmarks and
explain that the exact address is not configured. A configured empty location list stays empty after deletion.

## Technical boundaries (builder decisions)
Reuse PostgreSQL settings for versioned store-direction records, so no migration is needed.
Add an orchestrator around the existing engine, shared by test and voice entrypoints; current protected active
states bypass generative planning. Persist bounded dialogue context with conversation state and preserve it
when temporarily answering directions or handing off to an existing workflow. Restart clears it.
Model outputs use a validated structured schema: extracted context, approved-answer IDs, workflow choice,
acknowledgement choice and one bounded follow-up question. Business facts are rendered from current server
records, not accepted as arbitrary model-generated facts. Exact device/model values must be traceable to user
input/history; do not invent devices or repeat questions whose answers are known.

## Validation
Unit-test wet-device dialogues, known model in first message, corrections, short follow-ups, booking offer/yes,
store selection/address/landmarks, source updates, missing address, provider outage/malformed output and injection.
Browser-test admin direction edits and a multi-turn test conversation including reload. Test voice uses the same
orchestrator. Run existing full tests, typecheck, production build, and independent review before pushing.

## Non-goals
No self-editing prices or policies, autonomous training from customer text, live phone deployment, geolocation,
route calculation, new payment flow or unconfirmed repair diagnoses.
