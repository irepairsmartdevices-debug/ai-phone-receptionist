# Custom Answers and Model Pricing Implementation Plan

> **For agentic workers:** Implement with test-driven development; tasks 1–3 have disjoint file ownership and may run in parallel, then integrate/review.

**Goal:** Admin CRUD for custom Q&A and manual estimates alongside repair software prices, with model-specific follow-ups.
**Architecture:** Namespaced records in existing settings table, shared knowledge snapshot, conservative quote resolver and approved-answer matching. Existing admin guards and source booking remain authoritative.
**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL, existing OpenAI fetch client.
**Spec:** docs/superpowers/specs/2026-10-26-custom-answers-pricing-design.md

## Global Constraints
Admin-only; no new tables; no real calls enabled; source catalog pricing remains booking authority.
No invented device/price facts; no model-variant guessing; manual overrides must be linked explicitly.

## Review Focus
- Price changes/deletions between turns must use latest records.
- An override may affect quote only, never booking totals silently.
- Protected workflows and unknown-device questions must not fall through to arbitrary FAQs.
- Source outages must not remove exact matching manual estimates or invent source values.
- AI can select a current saved answer ID, never write answer text or authorize anything.

## Shared interfaces (root owns src/knowledge/types.ts)
CustomAnswer: {id:string,question:string,variations:string[],answer:string}.
ManualPrice: {id:string,category:string,brand:string,model:string,repair:string,priceCents:number,sourceOfferingId?:string}.
KnowledgeSnapshot: {answers:CustomAnswer[],prices:ManualPrice[]}.
Business offerings retain device/service/price/duration; optional categoryId/category/brandId/brand/modelId/model/serviceId.
getKnowledge():Promise<KnowledgeSnapshot>; per-record CRUD uses /api/knowledge with {kind:'answer'|'price',...record}.
ConversationEngine constructor adds fourth optional KnowledgeSnapshot and fifth optional AnswerMatcher
(text:string,answers:CustomAnswer[])=>Promise<string|null>.

### Task 1: Admin repository, API and UI
Files: src/knowledge/store.ts, app/api/knowledge/route.ts, app/knowledge/{page,client}.tsx,
app/layout.tsx, tests/knowledge-store.test.ts.
- [x] Write failing persistence/validation tests for CRUD, duplicate identities and individual row updates.
- [x] Implement bounded schemas, namespace records, atomic duplicate protection; reject unknown edits.
- [x] Implement admin authenticated/origin-protected GET/POST/PUT/DELETE with useful errors.
- [x] Implement accessible mobile CRUD with source list, explicit overrides, delete confirmation and test link.
- [x] Run focused tests; parent will browser-test auth and CRUD.

### Task 2: Guided pricing and Q&A engine
Files: src/conversation/engine.ts, src/knowledge/resolve.ts, tests/knowledge-engine.test.ts.
- [x] Write failing tests for brand/model/service follow-ups, exact initial model, variants, unknowns,
  deleted/updated estimates, explicit override restoration, FAQ variants and protected-flow precedence.
- [x] Add optional snapshot/matcher to engine; pure price resolution with fresh data each turn.
- [x] Implement conservative Q&A matching and ID-only semantic fallback.
- [x] Preserve booking workflow and disclose quoted manual differences before confirming source price.
- [x] Run engine and existing booking tests.

### Task 3: Source catalog hierarchy
Files: src/contracts/repair.ts; separate repair lib/receptionist/service.ts and tests.
- [x] Add backward-compatible optional hierarchy metadata to contract.
- [x] Expose source category/brand/model/service IDs and labels; test actual catalog projection.
- [x] Keep source prices in cents internally, convert only on current API boundary.
- [x] Retain source changes and refresh portable integration patch; do not deploy the other app.

### Task 4: Integration, semantic matching and verification (root)
Files: src/providers/knowledge.ts, app/api/test-conversations/route.ts, src/voice/webhook.ts,
tests/knowledge-provider.test.ts, tests/knowledge.spec.ts, playwright.config.ts, README.md.
- [x] Write failing semantic tests for current-ID validation, ambiguity, outage and malformed output.
- [x] Load latest knowledge for test/voice engine; preserve original speech details through intent routing.
- [x] Browser-test admin CRUD and exact-model replies; include anonymous/cross-origin denial.
- [x] Run full suite/typecheck/build; independent final review; fix substantive findings with regressions.
- [x] Commit, push authorized main app update and report remaining separate-app deployment setup.

## Results and limitations
- Main suite: 61 passing; includes 19 guided pricing/Q&A engine cases, provider guards, persistence and voice detail preservation.
- Source catalog suite: 279 passing; source TypeScript passed (source commit 2b396fd).
- Main production build passed; final browser/type checks recorded in VALIDATION.md.
- Independent review found two resolver issues (unsupported repair corrections and cross-model repair synonyms).
  Both reproduced RED and fixed GREEN with regressions; full suite green after fixes.
- Existing source-booking limitation: price can change after booking review because the source contract has
  no expected-price field. This feature does not promise a locked price or change payment/booking semantics.
- No new migration. Source patch cleanly applies to original ed1350a base; separate source app not deployed.
- Broader semantic matching requires the existing server-only AI_PROVIDER_KEY; deterministic questions/variants work without it.
