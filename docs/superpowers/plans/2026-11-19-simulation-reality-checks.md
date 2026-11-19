# Simulation Reality Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Keep core domain/SQL and UI files exclusively owned; root owns cross-module integration and deployment. Continuous execution is already requested.

**Goal:** Save personally confirmed falsifier/method/deadline plans from an exact saved hypothetical round and reopen them through case continuity.

**Architecture:**137 provides guarded owner-scoped plan CRUD, live simulation refs and hash-only receipts. A dedicated subpage previews user-authored input, then confirms.138 adds a read-only workspace union without changing old source rules.

**Tech Stack:** Existing Next.js14, React/TypeScript, shadcn/Tailwind, Supabase RPC/Postgres. No model or provider dependency.

## Task1: Domain, RPC and actual SQL contracts

Files: create `lib/domains/business-teardowns/reality-checks/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs}` and `supabase/migrations/137_business_reality_checks.sql`. Implement exact types and API in the approved spec; do not edit root schema/workspace/UI.

- [ ] Write failing schema/transport tests; run `npx vitest run lib/domains/business-teardowns/reality-checks` and observe missing implementation. Cover valid explicit confirmation, invalid date/round/text/owner, wrong response entity, source coherence and only expected missing-schema fallback.
- [ ] Add strict Zod types/transport. `realityCheckCommand(owner,command)` validates owner and payload, calls the operation-specific RPC, and rejects a receipt unless ID matches and revision equals expectedRevision+1.
- [ ] Implement137 using existing135 validators/service guard, UTF-16 text checks and strict object keys. Create locks the owned source row for share and verifies an existing selected round plus readable case. Update keeps immutable reference, does not require a still-live source. Receipts are checked before source validation and stored atomically with the write. Direct table access and helper execution are revoked; only the two public entrypoints grant service_role execution.
- [ ] Actual PGlite integrates119/120/135/137 with two owners,20+ records/tied pagination, retries after source erase, mismatched payload reuse, stale version, source anchor changes, missing rounds, append-only round validity, tombstones, failed receipt rollback, direct access denial and zero idea/validation/activity writes. Command: `node lib/domains/business-teardowns/reality-checks/postgres.integration.mjs <PGlite absolute path>`.
- [ ] Self-review and report scoped tests/SQL evidence. Root requests independent spec then quality review before merge.

## Task2: Confirmed plan UI

Files: create `app/(app)/business-lab/simulation/checks/{page.tsx,actions.ts,actions.test.ts,reality-checks-panel.tsx,reality-checks-panel.test.tsx,workflow.test.tsx,page.test.tsx}`; split additional view/form files in this directory if needed. Do not edit simulation parent or workspace.

- [ ] Read the spec's shared type/prop/action contracts. Write failing tests for source/round preview, exact saved IDs, source/case mismatch, dirty-input preview invalidation and off/signed-out gates.
- [ ] Implement authenticated page and action wrappers. Server computes `new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())` (or existing Tokyo helper). Keys distinguish new source/case/round while keeping same-record revision stable.
- [ ] Build Chinese Field Notes form: source→round→question/falsifier/method/dueDate→read-only preview→explicit confirmed save. Source details are live hypothetical own notes, not merchant facts; no result grade. Past deadlines show a date/overdue message without auto-completion.
- [ ] Preserve input and pending command on failed save; disable edits while pending; explicit same-request retry; refresh failure after confirmed write is distinct. Pagination retains current items on error. Focus compares stale remote record, then requires explicit adoption. Erase works without source.
- [ ] Run focused page/actions/workflow tests. Include expected missing137 and source deletion, and report results for root review.

## Task3: Entry and continuity integration (root)

Files: modify simulation-panel.tsx and relevant tests; workspace domain/tests; create138_business_workspace_reality_checks.sql; extend operating-postgres integration; append schema.sql only after final migrations reviewed.

- [ ] Add regression for entry visible only when at least one committed round exists, carries caseId/simulationId, and never enables a source-missing new-plan path.
- [ ] Add workspace enum/link `reality_check`→`/business-lab/simulation/checks?caseId=...&recordId=...` using validated IDs. Test full DTO projection and exact link beyond page1.
- [ ]138 retains all136 unions and adds independent plan question/falsifier/method plus deadline label, with no copies of simulation text. Preserve one global date/kind/id cursor.
- [ ] Actual combined SQL tests include ties across old/new kinds, source erase/append, owned plan retention, per-case scoping, orphan source visibility and no side effects.
- [ ] Append final137+138 SQL verbatim to full schema; verify exact suffix and migration collisions after fetch.

## Task4: Review, verification and production acceptance (root)

- [ ] Independent spec and code quality review; fix material findings with regressions.
- [ ] `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint`, final actual SQL suite. Do not run local Next build while a dev server is running.
- [ ] Synthetic actual-component browser checks: create/preview/cancel/edit/save/lost-response retry, source append/delete, same-record refresh and case/source changes, mobile overflow and console errors. All fixture mutations are local.
- [ ] Inspect actual production schema/security baseline, apply137 then138, verify table RLS/grants/helper ACL and owner/null-owner/anonymous read contracts without test writes.
- [ ] Commit reviewed code/docs, preserve fetched main updates, deploy and follow Vercel completion. Read-only authenticated production UI check, save screenshot, stop temporary fixture services. Record exact real-vs-synthetic limits and any genuinely external blockers.
