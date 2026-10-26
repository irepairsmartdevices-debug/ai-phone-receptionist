# Adaptive Dialogue Implementation Plan

> **For agentic workers:** Use test-driven implementation; parallel disjoint tasks, then integrate and independently review.

**Goal:** Context-aware repair intake with natural follow-ups, booking offers and grounded store directions.
**Architecture:** AI planner + constrained factual renderer around existing engine. PostgreSQL-persisted memory
and versioned admin directions; original engine retains all actions and price authority.
**Tech Stack:** Existing Next/React/TypeScript/PostgreSQL and OpenAI JSON-schema API.
**Spec:** docs/superpowers/specs/2026-10-26-adaptive-dialogue-design.md

## Global constraints
No new tables; admin-only changes; original price/booking/security engine authoritative; exact address never guessed.

## Shared interfaces (root types in src/conversation/assistant-types.ts)
StoreGuide {id,name,address,landmarks,sourceLocationId?}; getStoreDirections():Promise<{revision:number,locations:StoreGuide[]}>.
DialogueMemory {device?,model?,issue?,storeId?,offeredBooking?,asked?:'device'|'model'|'details',history?:{role:'user'|'assistant',text:string}[]}.
DialoguePlan {action:'ask_device'|'ask_model'|'ask_details'|'answer'|'offer_booking'|'booking'|'pricing'|'directions'|'hours'|'ticket'|'callback'|'other',device:string|null,model:string|null,issue:string|null,answerIds:string[],question:string|null,ack:'understood'|'thanks'|'sympathy'|'none'}.
DialoguePlanner=(input:{text,memory,answers})=>Promise<DialoguePlan|null>.
AssistantState=State & {assistant?:DialogueMemory}; orchestrator runAssistantTurn receives service/mode/knowledge/stores/planner/answerMatcher/onPending and normal turn args.

## Tasks
### 1. Store directions admin (agent)
- [x] RED tests for versioned persistence, missing address and provided Dallas landmarks.
- [x] Implement src/persistence/store-directions.ts, app/api/store-directions/route.ts,
  app/settings/directions.tsx, Settings integration; separate profile remains unchanged.
- [x] Export pure resolveStores(businessLocations,guides,mode) + renderDirections(store) in src/conversation/directions.ts;
  admin form can link source location IDs and show latest source addresses. Unknowns/ambiguous handled by orchestrator.
- [x] Focused tests pass; root browser tests.

### 2. Planner + orchestrator (agent)
- [x] RED tests for wet-device followups, memory, corrections, no repeats, directions interruption,
  booking offer/yes, model failure, output validation, no private-flow bypass.
- [x] Implement src/providers/dialogue.ts and src/conversation/assistant.ts consuming shared types.
- [x] get planner output, validate/bound/extract traceable facts, select saved facts, ask one question,
  preserve memory with all existing engine results; delegate active protected flows directly.
- [x] Use current source prices for pricing, directions renderer for locations and saved answers for policies.
- [x] Focused unit tests pass; no entrypoint edits.

### 3. Integration and full verification (root)
- [x] Wire both test and voice entrypoints to shared orchestrator and persistent memory.
- [x] RED/GREEN browser direction settings and dialogue reload test; provider/voice regressions.
- [x] Typecheck/full suite/production build/browser tests; independent review, substantive fixes with regressions.
- [x] Document remaining live-provider/repair-service deployment limitations; commit and push authorized main changes.
