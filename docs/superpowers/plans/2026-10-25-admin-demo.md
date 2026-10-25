# Admin Demo Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Admin-only online fictional conversations with password sign-in.
**Architecture:** Existing fixture engine, PostgreSQL hashed sessions, environment password.
**Tech Stack:** Next.js, TypeScript, PostgreSQL, node:crypto.
**Spec:** docs/superpowers/specs/2026-10-25-admin-demo-design.md

## Global Constraints
No staff accounts; no real data or live calls in demo; no new schema; HTTPS on Vercel.

## Review Focus
Reject anonymous and expired sessions; reject staff rows; invalidate rotated-password sessions;
reject cross-origin login; preserve connected/local operation.

## Task 1: Authentication and hosted fixture guard
- [x] Add failing tests for demo password, session validation, deployment bypass prevention and login throttle.
- [x] Implement src/auth/demo.ts, integrate guards, login/logout routes and sign-in form.
- [x] Run focused authentication tests.

## Task 2: Deployment and end-to-end verification
- [x] Update workspace environment labels and documentation with exact Vercel variables.
- [x] Verify unauthenticated redirect, bad password, authenticated message, logout and blocked access.
- [x] Run full tests, typecheck and production build; review diff and commit.

## Verification
- Authentication regressions: 5 passed.
- Full npm test: 32 passed after starting the existing repair integration server.
- Production build and TypeScript check passed.
- Production browser tests: desktop 1440px and mobile 390px, both passed.
- Browser proof includes rejected cross-origin login and anonymous mutation, incorrect password,
  sign-in, persisted fictional response, logout and rejected replay of the revoked session.
- Independent whole-change review: no security or correctness blockers.
- Initial production-browser runs encountered development-server build directory contention and
  an ambiguous Next accessibility alert selector; corrected test environment and selector, reran green.
