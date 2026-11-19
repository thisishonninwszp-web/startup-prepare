# Result Follow-up Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Exclusive core and UI files below, root integration, then independent spec/correctness review. User selected this concrete scope and requested continued implementation/release; proceed without repeat approval gates.

**Goal:** Let saved real-world findings lead to independently authored next confirmation plans while retaining original conditions/results.

**Architecture:**141 extends existing plans with exactly one immutable origin (simulation or own result), private dedicated RPCs and shared137 receipts/139 version capture. A child authoring route and142 workspace branch complete the loop into existing result recording.

**Tech Stack:** Existing Next14/React/TypeScript/Supabase/Tailwind/shared Field Notes. No AI/provider dependency.

## Task1: Core (exclusive core agent)

Files: new `lib/domains/business-teardowns/followup-checks/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs}` and `supabase/migrations/141_business_followup_checks.sql`. Read exact DTO/APIs/edge cases from approved spec. Do not change schema/UI/workspace.

- [x] Write failing tests for command shape, explicit confirmation, independent fields, revision bounds, strict source DTO without original snapshot, exact id/filter and keyset validation. Run `npx vitest run lib/domains/business-teardowns/followup-checks`, observe RED, implement and observe GREEN.
- [x] Alter parent fields nullable plus origin_result_id/check; old rows retain exact source shape. Existing command must reject followup IDs; existing read get/list exclude them, old DTO contracts unchanged. Dedicated save/erase uses same137 lock/receipts with canonical payload hash, source share lock on creation, fixed result anchor, update/erase allowed after source deletion.
- [x] Implement source/get/list exact owner RPC and fresh safe DTO. No copied source body in stored plan; list20 keyset timestamp+id descending. Revoke PUBLIC/anon/authenticated/service helpers, only grant public RPC service; tables remain RLS/private.
- [x] Actual PGlite: existing simulation+plan+result→new followup (empty fields refused), edit captures139 version, append139 results for followup, original data unchanged; source result erase→new creation denied but saved followup edit/erase allowed, all copied source prose absent; owner mismatch, legacy get/list exclusion/save rejection, same command retry after source erase, payload conflict, global ID tombstones and receipt rollback. Include20+ rows tied pagination and no decision writes. Run `node lib/domains/business-teardowns/followup-checks/postgres.integration.mjs <PGlite absolute entry>`.
- [x] Review implementation against spec and provide scoped verification evidence.

## Task2: UI (exclusive UI agent)

Files: new `app/(app)/business-lab/simulation/checks/next/**` only. Do not edit existing result/parent pages or workspace. May create `.tmp/followup-checks` fixture if useful; don't commit temporary artifacts.

- [x] TDD route/auth/gate/query validation; initial source exact owner/case; nullable source after deletion; no form prefill from result or old plan. Domain/actions/panel props exactly approved spec.
- [x] Implement source/body comparison and four empty plan fields using existing PlanFields/PlanPreview/ResultBody shared page views and shared Button/ConfirmButton. Preview→separate explicit save, original fields not overwritten. Source labels metadata-only; fetch body by exact id. Independent draft remains after source read error, source body hidden on focus before read and on failure; saved followup edit/erase survives source loss.
- [x] Pin pending commands/retry identity, distinguish receipt/read/list failures, explicit conflict comparison/adoption, dirty switch confirmation, pagination, source fixed queryscope, focus/busy and late response safety. Safe dead-source initial pending release only per triple exact-read protocol and explicit confirmation. Definitive erased saved record clears own cached row/body; erase clears cache before list refresh.
- [x] Saved clean plan links into `/business-lab/simulation/checks/results?caseId=...&planId=...&planRevision=...`; return exact origin result. Missing141 notice isolated. Scoped tests + lint/TS, document synthetic vs production boundaries.

## Task3: Root integration

- [x] RED then GREEN for saved-only result CTA `根据这条结果写下一份确认计划` carrying caseId/resultId; hide pending/busy/unsaved. Parent legacy exact record route redirects owned followup, rejects conflicting parameters, tolerates only expected missing141 for old plans. No new first-level nav.
- [x] Add followup_check workspace schema/label/fixed URL and142 branch from140. Exclude origin_result_id nonnull from reality_check branch, retain all other unions/global cursor. Mixed SQL creates followups and verifies no duplicate IDs, date/kind/id ties, case source erasure and live own summaries, owner guards/no decision writes.
- [x] Fetch remote, check141/142 collisions, append reviewed SQL verbatim to schema.sql. Baseline371 files/2387 tests already passed on isolated branch codex/result-followup-checks.

## Task4: Review and release

- [x] Independent specification/correctness/security review; resolve concrete findings with RED/GREEN regressions.
- [x] Full `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint` and final actual SQL. No local Next build while fixture/dev service running.
- [x] Real React synthetic browser: source→blank plan→preview→edit resets→lost response retry exactly one plan→record result→next plan; source erase hides body but own plan editable, own erase, fixed scopes and mobile/console. Production remains read-only.
- [x] Supabase preflight/advisor baseline, apply141 then142 (use logged-in SQL Editor if connector confirmation expiry recurs); verify migration history/ACL/RLS/private helpers and owner/null/anonymous SDK reads. No artificial personal rows.
- [x] Commit/push while preserving concurrent main; follow exact Production deployment receipt; logged-in canonical page and entry read, screenshot, cleanup own fixture, update actual acceptance evidence.

## Implementation acceptance

- Baseline371 files /2387 tests passed. Root entry/redirect/workspace regressions observed5RED then43GREEN; adjacent result cache regressions2RED then25workflowGREEN. Core8tests, UI41tests pass. Independent reviewer13suites106tests passed; previous P2 exact-null/stale-list findings resolved with per-mount deletion tombstones.
- Actual119/120/135/137/139/141 and mixed133–142 PostgreSQL/PGlite integration passed. Shared receipt/tombstone/rollback, old DTO compatibility, follow-up results loop, source loss, owner/ACL, tied keyset and no idea/validation/activity writes covered. PGlite is one connection, so concurrent interleavings are not proven; create holds source FOR SHARE against erasure.
- Actual React synthetic browser: original result→four empty plan fields→preview invalidation→lost-response retry keeps exactly1plan→new result→next blank plan. Failed focus read hides source text while own fields remain. Concurrent remote edit requires explicit comparison/adoption. Source result erased yet own plan can update; explicit plan erase clears own text.391px no overflow, zero warning/error console. Synthetic screenshot `.tmp/followup-checks/synthetic-mobile.jpg`. No production writes/provider calls in browser acceptance.

## Final verification and production database

- Full Vitest377 files /2443 tests pass. Full TypeScript exits0, ESLint zero warnings/errors; diff-check clean. Final actual141 and mixed133–142 integration scripts both pass.
-141 applied by Supabase connector as20261119122513;142 as20261119122530. Connector succeeded directly this release. Shared table retains RLS, exact-one-origin CHECK installed, anon/authenticated/service directSELECT/UPDATE denied; only service executes new2publicRPCs, helpers private with fixed search_path.
- Security advisor counts unchanged from baseline (INFO123; WARN19/5/12/1), zero new scoped findings.
- Production read-only SDK: owner followup list empty, missing get/source null; nullowner/anon read42501, anoncommand denied before dispatch, all4directtable reads denied foranon/service. Existing137/139/workspace reads succeed. No real plan/result rows inserted for health checks.
- Source SQL141/142 appended byte-for-byte to schema.sql; latest remote has no migration-number collision. Own fixture server stopped.

## Released acceptance

- Application commit `873dfb931e163664c6ea8a044d90f2c900e852be` pushed to main without overwriting concurrent work. Production deployment7913079960 succeeded2026-11-19T12:28:20Z (`startup-prepare-psi67zk90-forcus-wu-s-projects.vercel.app`); Preview was not used as production evidence.
- Logged-in canonical `/business-lab/simulation/checks/next` displays live-result selector beside four blank independent plan fields. Owner has no saved results/plans, so preview correctly remains disabled until an owned result is selected. Read-only refresh completes and re-enables controls, console has zero warning/error entries, desktop has no overflow. Full save/retry/conflict/erase/loop acceptance used actual React synthetic fixtures and real PostgreSQL contracts, not personal production writes.
- Production screenshot `.tmp/followup-checks/production-complete.jpg`; actual product tab retained as deliverable. Own fixture server stopped and mobile viewport reset. All tracked changes committed; temporary test artifacts kept outside commits.
- This final evidence-only commit is retained on the release branch; main already contains the released application and migrations.
