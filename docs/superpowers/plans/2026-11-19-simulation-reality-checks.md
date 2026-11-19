# Simulation Reality Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Keep core domain/SQL and UI files exclusively owned; root owns cross-module integration and deployment. Continuous execution is already requested.

**Goal:** Save personally confirmed falsifier/method/deadline plans from an exact saved hypothetical round and reopen them through case continuity.

**Architecture:**137 provides guarded owner-scoped plan CRUD, live simulation refs and hash-only receipts. A dedicated subpage previews user-authored input, then confirms.138 adds a read-only workspace union without changing old source rules.

**Tech Stack:** Existing Next.js14, React/TypeScript, shadcn/Tailwind, Supabase RPC/Postgres. No model or provider dependency.

## Task1: Domain, RPC and actual SQL contracts

Files: create `lib/domains/business-teardowns/reality-checks/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs}` and `supabase/migrations/137_business_reality_checks.sql`. Implement exact types and API in the approved spec; do not edit root schema/workspace/UI.

- [x] Write failing schema/transport tests; run `npx vitest run lib/domains/business-teardowns/reality-checks` and observe missing implementation. Cover valid explicit confirmation, invalid date/round/text/owner, wrong response entity, source coherence and only expected missing-schema fallback.
- [x] Add strict Zod types/transport. `realityCheckCommand(owner,command)` validates owner and payload, calls the operation-specific RPC, and rejects a receipt unless ID matches and revision equals expectedRevision+1.
- [x] Implement137 using existing135 validators/service guard, UTF-16 text checks and strict object keys. Create locks the owned source row for share and verifies an existing selected round plus readable case. Update keeps immutable reference, does not require a still-live source. Receipts are checked before source validation and stored atomically with the write. Direct table access and helper execution are revoked; only the two public entrypoints grant service_role execution.
- [x] Actual PGlite integrates119/120/135/137 with two owners,20+ records/tied pagination, retries after source erase, mismatched payload reuse, stale version, source anchor changes, missing rounds, append-only round validity, tombstones, failed receipt rollback, direct access denial and zero idea/validation/activity writes. Command: `node lib/domains/business-teardowns/reality-checks/postgres.integration.mjs <PGlite absolute path>`.
- [x] Self-review and report scoped tests/SQL evidence. Root requests independent spec then quality review before merge.

## Task2: Confirmed plan UI

Files: create `app/(app)/business-lab/simulation/checks/{page.tsx,actions.ts,actions.test.ts,reality-checks-panel.tsx,reality-checks-panel.test.tsx,workflow.test.tsx,page.test.tsx}`; split additional view/form files in this directory if needed. Do not edit simulation parent or workspace.

- [x] Read the spec's shared type/prop/action contracts. Write failing tests for source/round preview, exact saved IDs, source/case mismatch, dirty-input preview invalidation and off/signed-out gates.
- [x] Implement authenticated page and action wrappers. Server computes `new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())` (or existing Tokyo helper). Keys distinguish new source/case/round while keeping same-record revision stable.
- [x] Build Chinese Field Notes form: source→round→question/falsifier/method/dueDate→read-only preview→explicit confirmed save. Source details are live hypothetical own notes, not merchant facts; no result grade. Past deadlines show a date/overdue message without auto-completion.
- [x] Preserve input and pending command on failed save; disable edits while pending; explicit same-request retry; refresh failure after confirmed write is distinct. Pagination retains current items on error. Focus compares stale remote record, then requires explicit adoption. Erase works without source.
- [x] Run focused page/actions/workflow tests. Include expected missing137 and source deletion, and report results for root review.

## Task3: Entry and continuity integration (root)

Files: modify simulation-panel.tsx and relevant tests; workspace domain/tests; create138_business_workspace_reality_checks.sql; extend operating-postgres integration; append schema.sql only after final migrations reviewed.

- [x] Add regression for entry visible only when at least one committed round exists, carries caseId/simulationId, and never enables a source-missing new-plan path.
- [x] Add workspace enum/link `reality_check`→`/business-lab/simulation/checks?caseId=...&recordId=...` using validated IDs. Test full DTO projection and exact link beyond page1.
- [x]138 retains all136 unions and adds independent plan question/falsifier/method plus deadline label, with no copies of simulation text. Preserve one global date/kind/id cursor.
- [x] Actual combined SQL tests include ties across old/new kinds, source erase/append, owned plan retention, per-case scoping, orphan source visibility and no side effects.
- [x] Append final137+138 SQL verbatim to full schema; verify exact suffix and migration collisions after fetch.

## Task4: Review, verification and production acceptance (root)

- [x] Independent spec and code quality review; fix material findings with regressions.
- [x] `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint`, final actual SQL suite. Do not run local Next build while a dev server is running.
- [x] Synthetic actual-component browser checks: create/preview/cancel/edit/save/lost-response retry, source append/delete, same-record refresh and case/source changes, mobile overflow and console errors. All fixture mutations are local.
- [x] Inspect actual production schema/security baseline, apply137 then138, verify table RLS/grants/helper ACL and owner/null-owner/anonymous read contracts without test writes.
- [ ] Commit reviewed code/docs, preserve fetched main updates, deploy and follow Vercel completion. Read-only authenticated production UI check, save screenshot, stop temporary fixture services. Record exact real-vs-synthetic limits and any genuinely external blockers.

## Pre-release evidence (2026-11-19)

- Final365-file/2332-test suite, full TypeScript and ESLint pass. Actual137 SQL and133–138 combined SQL pass, including50 tied mixed records, cursor cuts inside the new kind, Unicode summaries, owner/RLS/ACL checks, rollback, source appends and erasure, and an unchanged seeded idea/validation. Independent spec and correctness/security reviews report no unresolved findings.
- Actual-component synthetic browser acceptance: selected round2, independent four-field input and explicit preview; editing invalidates preview; lost-save-response retry produces one plan; source append retains earlier notes; remote revision requires comparison/adoption while dirty input remains; source deletion hides old prose and allows own-plan update/erase.391px active viewport has clientWidth376/scrollWidth376, no console errors; reset and close afterward. Evidence `.tmp/reality-checks/verified-mobile.jpg` is local, not committed.
- Exact final137/138 migration bytes appended to schema.sql. No synthetic production plans, AI requests, provider requests, visitor events or idea-state/validation writes. Production schema preflight confirms135/136 and no new tables yet; security baseline saved for scoped comparison.

## Production migration checkpoint (2026-11-19)

- Implementation committed as a09f57e. Applied137 `business_reality_checks_137` version20261119013534, then138 `business_workspace_reality_checks_138` version20261119013544 through connected Supabase migration API.
- Actual catalog verifies both tables have RLS and deny SELECT for anon/authenticated/service_role. Read/command RPCs permit only service_role; three new helpers and private workspace helper deny all three roles. Real PostgREST owner plan/source lists and recent workspace succeed (currently empty); missing IDs return null; null-owner/anonymous reads, anonymous commands and direct table probes reject42501. No real plans were created.
- Advisor categories unchanged from baseline. New scope only has intentional INFO [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), because direct clients are denied and the guarded server RPC is the access path; no new scoped warning/error.
- Production code deployment and authenticated empty-state reading remain to verify.
