# Reality Check Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Run independent core and UI tasks with exclusive files, then root integration and independent spec/quality review. User chose this feature and requested continued execution/release.

**Goal:** Compare retained original plan conditions against manually recorded real-world findings and sources without retroactive edits or automatic validation claims.

**Architecture:**139 snapshots owned plan versions through atomic triggers, stores immutable result bodies and erasure-aware frozen plan refs, and exposes guarded RPCs. A results subpage previews the chosen version beside own notes.140 extends the existing workspace cursor and root adds the parent entry.

**Tech Stack:** Existing Next.js14/React/TypeScript, shared Field Notes shadcn/Tailwind and Supabase/Postgres. No AI or fetching supplied URLs.

## Task1: Core versions/results (exclusive core agent)

Files: create `lib/domains/business-teardowns/reality-results/{domain.ts,domain.test.ts,transport.ts,transport.test.ts,postgres.integration.mjs}` and `supabase/migrations/139_business_reality_results.sql`. Exact shared API/types in approved spec; don't edit schema/UI/workspace.

- [x] Write failing schema/transport/SQL behavioral tests. `npx vitest run lib/domains/business-teardowns/reality-results` must fail before implementation. Cover strict body and safe HTTPS, date bounds, owner/identity mismatches, version/keyset cursors and receipt versions1/2.
- [x] Implement Zod + uncached RPC functions exactly spec. SQL validates Tokyo not-future independently of browser clock. Text uses existing UTF16 helper; stored historical versions include only four own plan fields.
- [x]139 locks plan writes while seeding existing current versions, then captures inserts/updates. Delete trigger removes version prose and clears all result plan snapshots in the same137 transaction. No snapshot of simulation/report/case names. Frozen selected version survives later plan edits.
- [x] Append/erase result transactions use payload-bound hash receipts checked before source existence, tombstones, owner service guard and fixed safe search_path. New result requires owned plan+stored version; erasure doesn't require source.
- [x] Run actual119/120/135/137/139 PGlite with preexisting current plan, missing older version, inserts/updates, old version append, later edits, explicit independent data erasure, receipt-first retries after source delete, forced rollback including failed137 deletion receipt, both-owner ACL, timestamp/date/URL/Unicode edges,20+ plans/results/versions and seeded idea/validation unchanged. Command `node lib/domains/business-teardowns/reality-results/postgres.integration.mjs <PGlite entry>`.
- [x] Self-review and report evidence; no git/production/provider mutations.

## Task2: Results UI (exclusive UI agent)

Files: create `app/(app)/business-lab/simulation/checks/results/**` page/actions/panel/view tests and fixture files; split views/workflow logically. Do not edit parent plan or workspace.

- [x] TDD for strict query scopes/version IDs, missing139 isolated fallback, authenticated actions, source version preview and unselected vs erased source notices.
- [x] Implement page props/action APIs from spec. Exact historical version is preloaded even past page1. Plan selector includes owned plans with missing case/simulation; source requirement is owned saved plan version. Fixed planId scope is retained on new draft. Tokyo date via formatToParts or existing tested helper.
- [x] Form independently collects checkedOn/examined/found/sourceNote/optional sourceUrl/learned; date max=today. Show chosen frozen plan side by side, preview→explicit confirmed append. No prefilled findings or automatic outcome grade. Historical saved versions cannot be silently replaced with current.
- [x] Saved result is read-only; append corrections as new entries, explicit erase and return links. List/source/version pagination and exact get; passive source checks fail closed for cached plan prose; user notes remain readable. Preserve pending body and retry identity, distinguish write vs list failure, ignore late response after source/record switch.
- [x] Add late-plan warning if checkedOn predates plan's Tokyo saved day, with same-day order unproven. Safe external links (no fetch) and no score/demand claim. Scoped tests and lint/tsc; report any contract issue to root/core.

## Task3: Parent/workspace/schema (root)

- [x] Add RED regression for saved-clean plan entry carrying caseId/planId/planRevision, absent on dirty/pending/conflicted unsaved version. Implement entry with shared Button/Link. Add plan deletion note explaining snapshot wipe vs retained independent records.
- [x] Add `reality_result` workspace kind/link `/business-lab/simulation/checks/results?caseId=...&recordId=...`; test full DTO and fixed identity route.
- [x]140 retains138 unions and adds result learned/found only, revision1/createdAt and snapshot availability; update cursor enum. Actual mixed SQL test creates multiple tied results, cuts cursor inside new kind, checks snapshot clear and body retention after plan deletion, and no decision side effects.
- [x] Append reviewed139/140 SQL verbatim to schema.sql and verify exact suffix. Fetch remote and check no migration collision.

## Task4: Review and release (root)

- [x] Independent spec then correctness/security/quality review for core/UI/integration. Fix material findings with regressions.
- [x] Full `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint`, final actual SQL. No local Next build while dev server runs.
- [x] Actual-component synthetic browser: old-version compare; draft edit resets preview; append/lost-response recovery one result; later plan change old condition stable; source erase clears snapshots and keeps body/erase; mobile overflow/console. No invented personal production rows/providers.
- [x] Production preflight/advisor baseline,139 then140 apply, catalog/private ACL and read-only owner/null-owner/anonymous contract checks. No application write as a health probe.
- [ ] Commit/push preserving main changes, follow Production-specific Vercel receipt, verify logged-in parent/results empty state, screenshot, stop own fixture service and document real-vs-synthetic limits.

## Verification evidence before release

- Full suite:371 files /2387 tests passed including the final focus-race regression (22 UI workflow tests).
- Final TypeScript exit0 and ESLint clean (zero warnings/errors); focus handler uses the latest callback ref and skips overlapping busy operations.
- Actual119/120/135/137/139 and mixed133–140 PGlite passed. Source deletion rollback, hash receipts, historical snapshots, owner/private ACL and keysets verified.
- Independent final reviewer found one busy/focus lockup; fixed with a busy guard and failing-then-passing regression. No further material SQL/transport/workspace findings.
- Actual React synthetic browser: preview invalidation, lost-response retry retains exactly one result, original version survives later edits, deleting source removes plan prose but keeps own findings, explicit result erase removes body,391px mobile no overflow, zero warning/error console logs. No production writes or provider requests during acceptance. Local screenshot retained in `.tmp/reality-results/synthetic-mobile.jpg`.

## Production database acceptance

- Supabase connector apply confirmation expired twice; used existing authenticated Chrome SQL Editor as fallback, keeping reviewed SQL and recording each complete statement in migration history in the same transaction.139 version20261119102600;140 version20261119102610. Both returned success.
- Catalog: all3 tables RLS enabled, anon/authenticated/service directSELECT denied; only service_role can call the2 public RPCs, all helper/capture functions private with fixed search_path.
- Read-only SDK probe: owner list/plans empty, missing get/version null, versions empty; nullowner and anonymous42501, anonymous command denied before dispatch, all directtable checks42501, existing workspace readable. No invented production result rows.
- Security advisor baseline WARN counts unchanged19/5/12/1; only3 expected INFO additions for RPC-only tables without policies. Direct access stays revoked. [Supabase advisory reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
