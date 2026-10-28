# Gemini Receptionist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add the owner's selected Gemini provider with context-aware repair dialogue, current catalog routing, and an honest administrator connection check.

**Architecture:** A shared provider factory supplies a validated dialogue planner and answer matcher to both simulator and voice. The existing workflow engine continues to own prices, verification, and mutations. Gemini chooses supported question goals/styles and current approved/catalog references; server code composes the response.

**Tech Stack:** Existing Next.js 15, TypeScript, Zod, PostgreSQL, Node test runner, Playwright; Gemini generateContent REST, no new SDK dependency.

**Spec:** `docs/superpowers/specs/2026-10-27-gemini-receptionist-design.md` (owner approved).

## Global Constraints

- `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`; absent provider keeps existing OpenAI behavior. Gemini default `gemini-3.8-flash` per checked official cookbook.
- Exact owner-written topic answers and current repair-source prices remain authoritative; no new staff access, migrations, price edits, or Live audio rebuild.
- No API keys/customer private fields in logs, browser data, connection checks, or provider fallback. No silent cross-provider failover.
- Chat and voice share behavior; missing/failed providers use existing deterministic workflows.
- Watch meaningful new tests fail before implementing; independent review and full suite/build before push. Existing authorized deployment workflow remains in scope.

## Review Focus

- An old conversation state must load without migration and retain useful context; test in Task 2.
- A provider-selected shorter model must not turn an unknown variant into a quote; test in Task 2.
- Model/auth/quota failures must be distinguishable to admin without raw response/key leakage; test in Tasks 1 and 3.
- An absent provider variable must not disable an existing OpenAI deployment; test in Task 1.
- A correction after a previous quote must not silently quote the old model/repair; test in Task 2.

## Shared interfaces and ownership

`src/conversation/assistant-types.ts` is owned by Task 2. Existing `DialoguePlan` fields stay compatible. Add optional fields:

```ts
type DialogueGoal = "device" | "model" | "symptoms" | "liquid" | "occurredAt" | "power" | "offer_visit";
type DialogueStyle = "direct" | "warm" | "contextual";
type DialogueDetails = { liquid?: string | null; occurredAt?: string | null; symptoms?: string | null; power?: string | null };
// DialoguePlan extensions:
// details?: DialogueDetails; nextGoal?: DialogueGoal | null;
// style?: DialogueStyle; catalogOfferingId?: string | null;
// reset?: "device" | "issue" | null;
// DialoguePlanner input extension:
// catalog?: {id:string; category:string; brand:string; model:string; repair:string}[];
```

Task 1 owns `src/providers/config.ts`, `gemini.ts`, `assistant.ts` and provider tests. Task 2 owns conversation types/orchestration/question registry and dialogue tests. Root owns route/UI integration, readiness persistence/endpoint, docs, integration tests and final verification. Shared files are not edited concurrently.

Factory exports from `src/providers/assistant.ts`:

```ts
type AIStatus = {provider:"gemini"|"openai"|"none"; model:string; configured:boolean; reason?:AIErrorReason};
type AIErrorReason = "configuration"|"missing_key"|"authentication"|"model"|"quota"|"timeout"|"unavailable"|"response";
type AIConnectionResult = AIStatus & {ok:boolean; reason?:AIErrorReason};
getAIStatus(env?:Record<string,string|undefined>): AIStatus;
createAssistantProviders(env?:Record<string,string|undefined>, fetcher?:typeof fetch): {planner:DialoguePlanner; answerMatcher:AnswerMatcher};
checkAIConnection(env?:Record<string,string|undefined>, fetcher?:typeof fetch): Promise<AIConnectionResult>;
```

## Task 1: Selected provider transport and validated Gemini contracts

**Files:** Create provider modules above and `tests/gemini-provider.test.ts`; preserve existing OpenAI provider signatures/tests.

**Interfaces:** Consumes compatible conversation types; produces factory/status/check interfaces above. Optional Gemini fields may be implemented before Task 2 writes their types using local structural types.

- [ ] Write tests for legacy OpenAI selection, explicit Gemini key isolation/default/custom model, none/unknown/missing configuration, one-call-per-turn budget, approved IDs/catalog IDs and structured extraction.
- [ ] Run `node --env-file=.env --import tsx --test tests/gemini-provider.test.ts`; observe missing behavior failure.
- [ ] Implement Gemini POST v1beta `models/<validated model>:generateContent`, `x-goog-api-key`, JSON `responseJsonSchema`, bounded input/output/time; skip thought parts and require STOP. Validate local schemas and references. Redact customer inputs before transport, no raw response logging.
- [ ] Implement fixed-prompt connection check and safe auth/model/quota/timeout/response classifications. Keep one request per check, no retries. Keep default OpenAI compatible and no implicit Google/OpenAI credential reuse.
- [ ] Run provider suites; record RED/GREEN evidence and changed files. Commit only owned files after root integration coordination.

## Task 2: Rich intake, safe questions and semantic catalog routing

**Files:** Modify `src/conversation/assistant-types.ts`, `assistant.ts`; create a small question/grounding helper if needed; modify/add `tests/gemini-dialogue.test.ts`, existing adaptive tests only for necessary compatible expectations.

**Interfaces:** Consumes factory-produced extended plans; produces existing `runAssistantTurn` signature with optional compatible types above. Do not edit provider or route files.

- [ ] Write tests for paraphrased wet-device intake, distinct liquid/time/symptoms/power slots, multi-detail first message, missing-goal choice/style, non-Apple catalog models, corrections, exact saved topics, paraphrased pricing and directions, old state compatibility, unknown variant, malicious references/proposals and protected-state bypass.
- [ ] Run dialogue tests; observe specific missing behavior failures.
- [ ] Extend bounded redacted memory with explicitly supported details. Validate extraction against current customer text/history and corrections; keep known details and avoid repeat questions. Use server-defined goal/style question variants, no unrestricted generated prose.
- [ ] Supply bounded public catalog identities without money to the planner and validate chosen IDs; route valid semantic price/directions/hours intents into existing deterministic workflows. Read current source each pricing turn and preserve unknown/ambiguous exact variants, manual override policy and custom topic wording.
- [ ] Run new dialogue plus existing adaptive/knowledge/engine tests. Record evidence; commit only owned files after root coordination.

## Task 3: Shared integration and administrator Gemini connection check

**Files:** Modify test-conversation route, voice webhook, settings/knowledge pages; create `src/providers/readiness.ts`, `app/api/ai/check/route.ts`, `app/settings/ai.tsx`, `tests/ai-readiness.test.ts`; update provider-aware UI copy.

**Interfaces:** Consumes Task 1 factory/status/check; store only safe provider/model/config fingerprint and check result in existing settings namespace. Use HMAC credential fingerprint internally, never send/store the raw key. A changed key/model must invalidate old success.

- [ ] Write endpoint/persistence/UI tests for admin/origin guard, missing key, successful check, safe errors, failed subsequent check, changed configuration and rapid repeat checks; observe RED.
- [ ] Use existing settings/PostgreSQL advisory lock to reserve one check per configuration per 30 seconds; no migrations. Return 429/Retry-After on rapid repeats. Bound provider check duration and avoid holding pooled transaction across provider HTTP.
- [ ] Wire factory into both shared callers. Update Settings with selected provider/model, configured vs successful checked state and Test Gemini connection action; Knowledge semantic availability follows selected config.
- [ ] Run readiness, existing provider/chat/voice tests, typecheck and actual simulator browser tests using deterministic local provider fixtures.
- [ ] Update `.env.example`, README, setup documentation and approved spec status. Record task evidence and commit root-owned changes.

## Task 4: Independent review, verification and authorized deployment

- [ ] Review all changes against approved spec, plus provider schema reference and price/current-state invariants.
- [ ] Run `npm test`, relevant integration and browser suites, `npm run typecheck`, `npm run build`, `git diff --check`; investigate actual failures rather than weakening assertions.
- [ ] Independent reviewer checks full diff; reproduce substantive findings with failing tests, fix and rerun affected/full required checks.
- [ ] Commit final validation/docs, integrate into receptionist work branch and push authorized `origin/main` without altering repair app. Keep existing private settings untouched.
- [ ] Tell owner code result and exact three production variables; guide Google key setup one screen at a time. Explicitly distinguish local/mock verification from actual Google connectivity, which needs their private key and hosted connection check.
