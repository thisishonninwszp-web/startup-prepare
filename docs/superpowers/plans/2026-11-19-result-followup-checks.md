# Result Follow-up Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Exclusive core and UI files below, root integration, then independent spec/correctness review. User selected this concrete scope and requested continued implementation/release; proceed without repeat approval gates.

**Goal:** Let saved real-world findings lead to independently authored next confirmation plans while retaining original conditions/results.

**Architecture:**141 extends existing plans with exactly one immutable origin (simulation or own result), private dedicated RPCs and shared137 receipts/139 version capture. A child authoring route and142 workspace branch complete the loop into existing result recording.

**Tech Stack:** Existing Next14/React/TypeScript/Supabase/Tailwind/shared Field Notes. No AI/provider dependency.

## Task1: Core (exclusive core agent)

Files: new `lib/domains/business-teardowns/followup-checks/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs}` and `supabase/migrations/141_business_followup_checks.sql`. Read exact DTO/APIs/edge cases from approved spec. Do not change schema/UI/workspace.

- [ ] Write failing tests for command shape, explicit confirmation, independent fields, revision bounds, strict source DTO without original snapshot, exact id/filter and keyset validation. Run `npx vitest run lib/domains/business-teardowns/followup-checks`, observe RED, implement and observe GREEN.
- [ ] Alter parent fields nullable plus origin_result_id/check; old rows retain exact source shape. Existing command must reject followup IDs; existing read get/list exclude them, old DTO contracts unchanged. Dedicated save/erase uses same137 lock/receipts with canonical payload hash, source share lock on creation, fixed result anchor, update/erase allowed after source deletion.
- [ ] Implement source/get/list exact owner RPC and fresh safe DTO. No copied source body in stored plan; list20 keyset timestamp+id descending. Revoke PUBLIC/anon/authenticated/service helpers, only grant public RPC service; tables remain RLS/private.
- [ ] Actual PGlite: existing simulation+plan+result→new followup (empty fields refused), edit captures139 version, append139 results for followup, original data unchanged; source result erase→new creation denied but saved followup edit/erase allowed, all copied source prose absent; owner mismatch, legacy get/list exclusion/save rejection, same command retry after source erase, payload conflict, global ID tombstones and receipt rollback. Include20+ rows tied pagination and no decision writes. Run `node lib/domains/business-teardowns/followup-checks/postgres.integration.mjs <PGlite absolute entry>`.
- [ ] Review implementation against spec and provide scoped verification evidence.

## Task2: UI (exclusive UI agent)

Files: new `app/(app)/business-lab/simulation/checks/next/**` only. Do not edit existing result/parent pages or workspace. May create `.tmp/followup-checks` fixture if useful; don't commit temporary artifacts.

- [ ] TDD route/auth/gate/query validation; initial source exact owner/case; nullable source after deletion; no form prefill from result or old plan. Domain/actions/panel props exactly approved spec.
- [ ] Implement source/body comparison and four empty plan fields using existing PlanFields/PlanPreview/ResultBody shared page views and shared Button/ConfirmButton. Preview→separate explicit save, original fields not overwritten. Source labels metadata-only; fetch body by exact id. Independent draft remains after source read error, source body hidden on focus before read and on failure; saved followup edit/erase survives source loss.
- [ ] Pin pending commands/retry identity, distinguish receipt/read/list failures, explicit conflict comparison/adoption, dirty switch confirmation, pagination, source fixed queryscope, focus/busy and late response safety. Safe dead-source initial pending release only per triple exact-read protocol and explicit confirmation. Definitive erased saved record clears own cached row/body; erase clears cache before list refresh.
- [ ] Saved clean plan links into `/business-lab/simulation/checks/results?caseId=...&planId=...&planRevision=...`; return exact origin result. Missing141 notice isolated. Scoped tests + lint/TS, document synthetic vs production boundaries.

## Task3: Root integration

- [ ] RED then GREEN for saved-only result CTA `根据这条结果写下一份确认计划` carrying caseId/resultId; hide pending/busy/unsaved. Parent legacy exact record route redirects owned followup, rejects conflicting parameters, tolerates only expected missing141 for old plans. No new first-level nav.
- [ ] Add followup_check workspace schema/label/fixed URL and142 branch from140. Exclude origin_result_id nonnull from reality_check branch, retain all other unions/global cursor. Mixed SQL creates followups and verifies no duplicate IDs, date/kind/id ties, case source erasure and live own summaries, owner guards/no decision writes.
- [ ] Fetch remote, check141/142 collisions, append reviewed SQL verbatim to schema.sql. Baseline371 files/2387 tests already passed on isolated branch codex/result-followup-checks.

## Task4: Review and release

- [ ] Independent specification/correctness/security review; resolve concrete findings with RED/GREEN regressions.
- [ ] Full `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint` and final actual SQL. No local Next build while fixture/dev service running.
- [ ] Real React synthetic browser: source→blank plan→preview→edit resets→lost response retry exactly one plan→record result→next plan; source erase hides body but own plan editable, own erase, fixed scopes and mobile/console. Production remains read-only.
- [ ] Supabase preflight/advisor baseline, apply141 then142 (use logged-in SQL Editor if connector confirmation expiry recurs); verify migration history/ACL/RLS/private helpers and owner/null/anonymous SDK reads. No artificial personal rows.
- [ ] Commit/push while preserving concurrent main; follow exact Production deployment receipt; logged-in canonical page and entry read, screenshot, cleanup own fixture, update actual acceptance evidence.
