# Named Call Topics Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development for execution. Track the checks below.

**Goal:** Admins manage named topics with multiple caller triggers and custom answers written by the owner.

**Architecture:** Extend existing knowledge settings records with optional metadata.
The shared chat/voice assistant prioritizes named custom topics at the normal
conversation step while preserving authoritative price, verification and action flows.

**Tech Stack:** Existing Next.js, TypeScript, Zod, PostgreSQL and Playwright; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-call-topics-design.md`

## Global constraints

- No schema migration; existing custom questions retain behavior.
- Optional `topic?: string` (120 characters); every answer remains mandatory.
- Preserve question/variations/answer interface and 15-variation limit; custom answers must be nonempty.
- Admin-only mutation guards, authoritative pricing and confirmed-action flows remain in force.

## Review focus

- Conflicting triggers cannot arbitrarily choose an answer.
- Empty custom answers cannot be saved.
- Named custom location topics must take precedence over built-in directions at start.
- Generic triggers such as yes or a numeric code cannot swallow protected steps.
- Old records and mobile admin editing continue to work.

### Task 1: Compatible storage contract

**Files:** `src/knowledge/types.ts`, `src/knowledge/store.ts`, `tests/knowledge-store.test.ts`.
**Produces:** Optional topic on CustomAnswer and create/update/getKnowledge.

- [x] Add regression proving metadata persistence/edit/delete, old records, bounded labels and empty-answer rejection; watch failure.
- [x] Extend validation and record parsing without a migration; retain mandatory custom answers.
- [x] Run focused storage tests and review changed code.

### Task 2: Shared response dispatch

**Files:** `src/conversation/assistant.ts`, `src/providers/dialogue.ts`, `src/providers/knowledge.ts`, focused topic and voice tests.
**Consumes:** Task 1 CustomAnswer contract.
**Produces:** Shared runAssistantTurn dispatch for exact/fuzzy and provider-selected named custom topics.

- [x] Write and run failing tests for several phrases, current answer edits, conflicts, deleted entries, protected steps and semantic selection.
- [x] Prioritize named topic matches over built-in directions at start, preserve guarded state priority and reuse current approved text.
- [x] Add signed-voice regression and run focused dialogue/voice tests.

### Task 3: Admin topic controls

**Files:** `app/knowledge/client.tsx`, `app/knowledge/knowledge.module.css`, `tests/knowledge.spec.ts`.
**Consumes:** Topic contract and existing /api/knowledge envelope.
**Produces:** Topic name, trigger phrases, Store Location example with blank answer, persisted edit/delete UI.

- [x] Add browser coverage for desktop/mobile topic CRUD, multiple triggers and custom location reply; preserve existing price/answer coverage.
- [x] Implement controls with explicit save and mandatory custom answer; leave production records untouched.
- [x] Run browser tests against production build.

### Task 4: Integrate and release

- [x] Run npm test, npm run typecheck and npm run build; inspect all results.
- [x] Run knowledge and adaptive browser suites; obtain independent review and address concrete findings.
- [x] Update validation documentation, commit and push authorized main branch update; report deployment verification limits.

Scope clarification: the owner selected custom written answers for Store Location; automatic response types were removed before implementation.

Completed verification: Node107/107; production knowledge browser6/6 and adaptive4/4; typecheck/build/diff checks passed. Fresh review finding on pending store-choice was reproduced and fixed with regression. Stable textarea labels were verified in final desktop/mobile CRUD.
