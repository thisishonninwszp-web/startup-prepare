# Confirmation History and Reusable Methods Delivery

> **For agentic workers:** REQUIRED SUB-SKILL subagent-driven-development. User approved both distinct features. Execute exclusive history, method-core and method-UI tasks, then root integration and independent spec/correctness review; continue through release without repeat approval gates.

**Goal:** See how own questions/results led to next plans, and explicitly turn findings into conditional methods reusable in existing counterexample research.

**Architecture:**143 read-only version/result projection.144 reuses existing learning entries with private result-origin metadata, receipt-safe append/erasure and existing counterexample compatibility.145 updates existing workspace source availability. No new idea statuses, AI calls or competing method store.

**Tech Stack:** Existing Next14/TypeScript/React/Supabase/shadcn/Field Notes, Vitest and actual PostgreSQL/PGlite.

## Task1 — History agent (exclusive)

Files: new `lib/domains/business-teardowns/history/**`, `app/(app)/business-lab/history/**`, `supabase/migrations/143_business_confirmation_history.sql`. Exact shared contracts in history spec.

- [x] Write domain/transport/auth/route/UI regressions, observe RED before implementation. Enforce kind/id/version/nullability/case identity; source/plan snapshots are live, no invented before139 versions.
- [x] Implement service-only bounded global at/kind/id/revision keyset projection/get. Helpers private, no writes, missing143 isolated.
- [x] Implement chronological history and exact parent traversal beyond firstpage, partial-page labeling, manual reload/pagination/focus fail-closed/late-response safety. No implicit status or causal claim. Link result cards to existing next plan and new methods route.
- [x] Run actual119/120/135/137/139/141/143 PostgreSQL tests: immutable versions, source result/plan erasure, current-only backfill, owner/privateACL,20+ tied nodes and no unrelated writes. Run scoped Vitest, lint/TS and report.

## Task2 — Methods core agent (exclusive)

Files: new `lib/domains/business-teardowns/result-methods/**`, migration144; existing counterexamples/domain.ts/transport.ts and their tests only. No app/schema/workspace edits. Exact contracts in method spec.

- [x] TDD strict confirmed five-field draft/UTF16/bytes, safe owner/result/case IDs, exact DTO/cursors/receipt identity; observe RED then implement GREEN.
- [x]144 tracks origins around existing learning entries. Implement source-locked append, shared learning receipts/tombstones, scoped physical own-method erasure guard preserving legacy quote erase; source erasure preserves independent method.
- [x] Preserve legacy report-method search and adoption; add nullable-report result-method projection and private result-method adoption helper used by existing132 command. Existing independent methods still reusable after result loss; own erase invalidates source, no source text copies. Keep all public/privateACL/search_path guards.
- [x] Actual PostgreSQL integration covers existing122/132 contract, source deletion, own erasure, immutable originals/corrected new entries, exactly-one adoption/retry/rollback, existing methodsearch/workspace assumptions, byte limits, dualowner/ACL and tied pagination. Report scope/evidence.

## Task3 — Methods UI agent (exclusive)

Files: new `app/(app)/business-lab/methods/**` only. Exact API/props in method spec, core in parallel. No changes other app files/domain/schema.

- [x] RED→GREEN route/auth/query/scope/new blank fields/preview tests. Strict unknownkeys, original result live only, no originalplan snapshot rendering. Saved method readonly with explicit erasure and exact counterexample link.
- [x] Pin request/body across loss and ack/read failure, distinguish list failure, source focus hides cached prose, definitive null/erase tombstones filter stale list. Dirty changes reset preview and switch confirmed. Fixed source preserved; pending deadsource release only triple exact-read + explicit confirmation.
- [x] Page/list/source pagination and exact reopening; missing144 isolated. Scoped tests/TS/lint and report no synthetic production/provider operations.

## Task4 — Root integration

- [x] Baseline full suite377 files/2443tests. Add RED→GREEN saved-result method/history CTA, case/operator/history entry, nullable-report source explanation and erased-method metadata-only rendering. No new globalnav.
- [x]145 preserves133 base unions, sets tracked result-method sourceAvailable by owned result existence;142 projection/cursor remains unchanged. Mixed143–145 SQL test checks no duplicate kinds/records, source deletion, existing method search and no decision side effects.
- [x] Existing workspace focus refresh hides cached erased prose and provides retry on failure, ignores older read responses. Meaningful lifecycle regressions before modification.
- [x] Fetch/check migrations, append reviewed143/144/145 exactly to schema.sql. Review independent spec/correctness findings with regressions.

## Task5 — Verification and release

- [x] Full npmtest, TypeScript, lint, final actual SQL; no local Next build while fixtures run. Actual React synthetic history and method save/erase/retry/source loss/counterexample links/mobile/console.
- [x] Production advisor baseline;143→144→145 apply, catalog/RLS/privatehelper/owner/null/anon SDK read-only probes; no fabricated personal rows/provider calls.
- [ ] Commit/push preserving main; verify exact Production Vercel success, logged-in canonical pages, screenshot, stop fixture/reset viewport and save accurate release evidence.

## Verification evidence (2026-11-20 JST)

- Baseline377 files/2443 tests; final full suite388 files/2511 tests passed. TypeScript exit0, final ESLint clean after removing two unused SQL-test helpers.
- Root linked-entry tests RED5→GREEN45; workspace focus/stale-page lifecycle RED2→GREEN4; independent reviewer found methods source read could finish after busy focus invalidation, root reproduced3RED then fixed all source installations with separate source-generation tokens (16workflow tests GREEN).
- History self-review found late stale list/exact-node responses could restore plan prose after another result proved plan erasure. Monotonic case/plan evidence fixed both response orders without fabricating erasure timestamps. History7files/29tests GREEN.
- Independent final reviewer18files/115tests PASS, no unresolved material findings; independently ran all3actual PostgreSQL scripts. PGlite single-connection tests do not prove concurrent interleavings; source locks and fixed owner lock ordering reviewed.
- Actual143 history,144 methods plus existing132 and full legacy learning SQL, and143–145 combined integration all pass. Includes current-only backfill, exact old version beyond20, tied ordering, physical erase, tagged receipt retries/rollback, report-backed compatibility, independent source-loss adoption, private ACL and no decision writes.
- Real React synthetic methods: five blank fields→preview/edit invalidation→lost-response retry exactly1method, failed focus source hidden/own body retained, source result erase→existing counterexample page still reads independent method without fake report, twice-confirmed erase removes own text.391px no overflow, zero error/warn console.
- Real React synthetic history: exact old-plan parent opens revision1 despite later revision2, focus read failure hides all prose, refresh restores verified fields, deleting plan removes both version cards and frozen condition text while independent result remains.391px no overflow, console clean. Artifacts `.tmp/history-methods/method-mobile.jpg` and `history-mobile.jpg`; no real production rows/providers used.

- Production143 version20261119163939 via connector;144 version20261120012610 and145 version20261120012634 via authenticated SQL Editor after connector confirmation expiry. Manual history SQL hashes match LF-normalized source. Private origins RLS enabled, anon/auth/service direct access denied; only the3new public RPCs service-executable, helpers private with fixed search_path.
- Production read-only SDK probes pass: owner list/exact missing gets/source, nullowner/anon42501, origins direct42501, existing137/139/141/workspace/counterexample methods reads. Owner currently has zero saved records in these lists, so no fabricated production writes.
- Advisor existing WARN counts unchanged19/5/12/1; one expected new INFO for private no-policy origins table (RLS plus denied table grants, server-only RPC).
