# Gemini 3.8 Interactions compatibility plan

> **For agentic workers:** Use executing-plans for the inline implementation and a fresh independent reviewer before publishing.

**Goal:** Match the owner's exported Gemini 3.8 Interactions request while retaining the receptionist's structured-output boundaries.

**Architecture:** Route exact `gemini-3.8-flash` requests through Google's documented `v1beta/interactions` REST contract. Keep other Gemini models on the existing generateContent path. Both health checks and customer planning use the same adapter; the live timeout's root cause remains unproven.

**Tech Stack:** TypeScript, native fetch, Zod, node:test, Next.js 15.

**Spec:** Owner's Google AI Studio export in this conversation; Google's Python SDK `34b58fd1b2aa387dff5976bbefa1c1268958369f` and cookbook `b06b824cf2ea29f9543ffa14adcee68b5f934a9b`.

## Global constraints

- Keep model selection, private keys, one request per turn, 8-second planning and 30-second health deadlines.
- Keep current 2048/512 output caps, redacted public input and local strict plan/ID validation.
- Use `store:false`, `stream:false`, `background:false`; no tools, previous interaction IDs, polling, retries or provider fallback.
- Accept only completed, error-free model text output; ignore thought content and reject tool/unknown/nontext steps.

## Review focus

- Raw REST supplies `steps`, not the SDK-only `output_text` convenience.
- Truncated/incomplete/error responses must never count as successful checks or plans.
- No owner answer prose, private history/contact data, keys or raw provider errors reach output.
- Legacy Gemini models and OpenAI must preserve behavior.
- A local mock passing is not evidence that the production Google key works.

## Task 1: Adapter and verification

**Files:** Create `src/providers/gemini-interactions.ts` and `tests/gemini-interactions.test.ts`; modify the Gemini dispatcher, existing legacy/readiness fixtures, integration guide and validation record.

- [x] Write real consumer tests with independent Interactions REST fixtures; run and observe successful check/plan cases fail against the legacy endpoint/parser.
- [x] Add `generateGeminiInteractionJSON(key, model, system, data, schema, fetcher, maxOutputTokens, timeoutMs): Promise<unknown>` and dispatch exact Gemini 3.8 through it.
- [x] Validate completed model-output steps locally before JSON parsing; preserve shared bounded reads and safe HTTP classification.
- [x] Update existing fixtures to explicitly test the retained legacy model path and the new deployed-default path.
- [x] Run targeted tests, full `npm test`, production build, typecheck and whitespace checks; obtain independent review.
- [ ] Publish the reviewed commit; ask the owner for one fresh deployed check without changing their key/model settings.
