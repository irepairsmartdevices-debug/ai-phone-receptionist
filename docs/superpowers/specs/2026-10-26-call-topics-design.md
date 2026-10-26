# Named call topics and multiple triggers

The owner wants admin-managed topics such as `[Store Location]`, each with several
ways a caller can ask, so chat and phone calls receive the appropriate response.
They clarified that they want to write the custom answer themselves, including the
Store Location answer. This feature request authorizes implementation.

## Approach and scope

Extend existing saved question/alternate-phrase entries with an optional topic
label. The alternative of linking a topic to automatic store directions was
offered; the owner chose custom written answers. A general workflow builder is
unnecessary for this request and is outside scope.

- `topic?: string`, maximum 120 characters, is an admin label shown in brackets.
- Existing `question`, `variations` (up to 15) and required `answer` stay compatible.
- Admin UI adds topic name and clearly labelled multiple trigger phrases. A Store
  Location example fills a topic, question and phrases; the answer starts blank
  for the owner to write. No placeholder answer is saved or invented.
- Existing admin-only add/edit/delete, validation and confirmation apply to topics.
- Every saved phrase may trigger the same custom response. Similar wording can
  use the configured AI provider; all answers come from current approved records.
- A matching named topic takes precedence over built-in location directions while
  at the normal conversation step, so the owner's custom Store Location text is
  actually spoken. Unmatched direction requests retain current saved directions.
- Conflicting saved triggers ask for clarification rather than choosing randomly.
- Generic triggers cannot consume ticket verification codes, booking confirmations
  or active price clarification. Prices, personal repair intake and confirmed
  actions retain their current workflows. A yes to an actual booking offer still
  starts booking. Explicit public directions may interrupt protected states using
  the existing renderer while preserving them.
- No migration or new dependency, real Twilio deployment or production knowledge
  edits. Chat and signed webhooks are tested locally.

## Validation

Persist/edit/delete topic metadata; validate bounds and mandatory custom answer;
load legacy entries unchanged. Exercise multiple phrases, matching custom location
answers, conflicts, updated/deleted entries, AI selection and protected states.
Test signed voice and desktop/mobile admin CRUD. Run full tests, typecheck,
production build and independent review before pushing.
