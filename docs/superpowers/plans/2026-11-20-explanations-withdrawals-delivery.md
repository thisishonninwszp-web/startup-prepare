# Competing Explanations and Withdrawal Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL subagent-driven-development. Approved spec: `docs/superpowers/specs/2026-11-20-explanations-and-withdrawals-design.md`. Execute continuously, review spec before quality, do not repeat user approval gates. New paid discovery remains disabled.

**Goal:** Compare saved explanations against precommitted observations, and read nonrepeating official withdrawal lessons through existing investigation workflows.

**Architecture:**146 introduces explicit withdrawal subjects alongside shop cases, official sources/lessons/daily slots and guarded reads/commands.147 adds explanation-origin plans using137 receipts/139 versions/results.148 connects research/history/workspace, retaining all legacy shop branches. Existing AI generation is reused for report explanations; separately budgeted withdrawal collection defaults off.

**Tech Stack:** Next14/TypeScript/React/shadcn/Tailwind/Supabase RPC, Vitest, actual PostgreSQL/PGlite. No new libraries.

## Shared contracts and boundaries

- `business_daily_cases.case_kind`: `shop` default or `withdrawal`; withdrawal rows have null merchant and an owned lesson ID. Exactly one subject, immutable. Replace per-user date uniqueness with per-user/date/kind uniqueness; keep merchant uniqueness. Every legacy today/reserve/list path must remain shop-only. New helper `business_subject_context(owner,caseId)` returns `{caseId,caseTitle,kind}`; simulation remains shop-only. Results/methods/history use true case IDs.
- New `lib/domains/business-teardowns/withdrawals/**`: domain/transport + SQL integration. Source issuer registered by owner explicitly, never AI-established. Source text, dates, event scope and exact quotes frozen with content hash. User confirms disclosure semantics; automated content stays draft without verified subject/issuer/event. Null reason remains explicit. No URL-fetch failures inferred as closure.
- `WithdrawalLesson`: `{id,caseId:null|string,subject:{name,operator,market,scope,identityKey},event:'exit'|'shrink'|'stop',phase:'announced'|'completed',announcedOn:string|null,effectiveOn:string|null,source:{issuerId,url,text,capturedAt,publishedOn,contentHash},eventQuote,reasonQuote:string|null,offering:string|null,buyers:string|null,explanationA:string|null,explanationB:string|null,distinguishingObservation:string|null,unknowns:string[],revision,createdAt,erasedAt:null|string}`. Disclosure fields need separate exact quote bindings where applicable; no unsupported factual paraphrases. Legacy reports are not lesson report payloads.
- `withdrawalRead(owner,op,input)`: issuers, list, get, today; `withdrawalCommand(owner,command)`: register_issuer, save, erase, select_today. Server resolves owner; receipt-first tagged hashes and retained tombstones. Bounded20-item date/UUID pages. `select_today` under owner/date lock selects earliest verified unselected subject, at most1/JSTday, no provider call, same day idempotent. No fabricated seed lessons. Erasure removes all source/analysis prose and invalidates live references without deleting independent user research.
- New `lib/domains/business-teardowns/explanations/**` exports domain/transport. `ExplanationAnchor={kind:'report',reportId,reportRevision,section,index,manifestHash}|{kind:'withdrawal',lessonId,lessonRevision}`. Both DTO source variants use `{caseId,title,explanationA,explanationB,distinguishingObservation,refs,anchor}` and resolve source prose live. Source A/B must exist; never fabricate missing alternatives.
- `ExplanationPlanDraft={question,expectedA,expectedB,uncontrolled,falsifier,method,dueDate}`. Own text fields are independent; all nonempty except uncontrolled allowed empty. Question1000, predictions/uncontrolled/falsifier/method3000 UTF16 each. dueDate existing cashDate. `ExplanationPlanRecord={id,caseId,anchor,draft,revision,createdAt,updatedAt,source:null|ExplanationSource}`. Command save/erase uses137 owner lock/receipts; source immutable for record, creation verified, updates preserve own fields after source loss. Results need exact versioned A/B expectations, erased when original plan is erased.
- Explanations use existing `business_reality_checks.plan` four-field contract for shared result flow; independent extra fields are stored per exact plan version in a private expectations table. New nullable `origin_explanation` metadata with exactly-one-origin check. Existing simulation read/command explicitly requires simulation_id; followups explicitly require origin_result_id. History parent adds explanation kind and exact origin link. Shared result/version DTO adds optional expectations only when present, preserving legacy strict shapes otherwise (update parsers compatibly).
- `/business-lab/explanations` strict caseId/recordId or exact anchor query. Preview/save independently authored predictions, exact original report source only; saved plans link existing result route using planId. `/business-lab/withdrawals` list/today/official issuer + source entry/detail with daily date distinct from event date, links to existing failure research and explanations. No first-level navigation.

## Task1 — Withdrawal foundation and core

Files: new withdrawals domain/transport/tests/integration, migration146; existing shop queries/jobs/SQL today guards only where required. Do not edit app/schema/explanations.

- [ ] Write RED domain tests: exact dates/URL/quote matching/subject normalization/null cause/phase/confirmation/UTF16/bytes; unknown fields rejected. Example: `expect(parseWithdrawal({...valid,eventQuote:'not in source'})).toThrow()`.
- [ ] Run scoped Vitest and observe missing implementation; implement pure schemas and transport with strict owner/DTO/cursor identity.
- [ ] Write actual SQL146 tests covering same-day shop+withdrawal, genuine owned case IDs, subject dedup across URLs, frozen sources, erase, receipts/rollback, two owners, private ACLs, invalid limits and no validations/idea writes. Observe RED, implement private tables/subjects/service RPCs and shared context.
- [ ] Preserve existing119/121/123 today/reserve behavior with explicit shop selection; patch list/load shop queries. Run original shop/job suites against146 too. No new collection activation.
- [ ] Scoped lint/TS and independent spec review, then quality review; fix findings before next task.

## Task2 — Explanation core and exact version integration

Files: new explanations domain/transport/tests/integration; migration147. Existing reality-results/followup/history domain+transport DTO parsing where needed; no app/schema files.

- [ ] RED schemas/transport tests for report anchor exact version/manifest/section/index, withdrawal exact revision, source identity, authored expectedA/B and strict receipts/cursors. Run `npx vitest run lib/domains/business-teardowns/explanations`.
- [ ] Add exact origin branch to checks and private versioned expectations; shared137 receipts, source locks and immutable anchors. Examples: append result at revision1 after plan revision2 must show revision1 expectedA/B; plan erase must remove both source versions and result snapshot expectations.
- [ ] Keep old137 simulation lists/commands strict; origin cases forbidden across command endpoints. Extend139 optional expectation projection and143 parent semantics; read-only helper source never copies removed report prose.
- [ ] Actual SQL across119/120/122/124/132/135/137/139/141/143/144/146/147: report and withdrawal paths, old contracts, exact versions, source loss, owner/ACL, receipt conflict/rollback and20+ tied pages. Review spec then quality.

## Task3 — Root explanation UI

Files: new app/business-lab/explanations page/actions/hook/panel/views/tests; report-view.tsx link tests; shared result views + history UI for optional expectations/new parent.

- [ ] RED route/auth/strict query and saved-report CTA tests. Anchor is encoded by canonical URLSearchParams; no owner from query.
- [ ] RED workflow for initially blank authored fields, preview invalidation, source loss, pinned request/body after lost response, focus hiding cached source and stale response protection. Implement with shared Button/ConfirmButton and existing page layout.
- [ ] Results display exact precommitted A/B and uncontrolled factors; no winner auto-selection. Links to existing followup/methods/history. Author erasure uses existing physical-clear paths.
- [ ] Actual React fixture browser flow report→plan→result and deletion/source loss/mobile/console.

## Task4 — Withdrawal UI and research integration

Files: new app/business-lab/withdrawals page/actions/panel/tests; existing research domain/queries/starter/UI and migration148; operator/business-lab page entry; workspace subject label read.

- [ ] RED auth/query/issuer/lesson input tests, publication vs event date, no cause vs company stated reason, unchanged original source.
- [ ] Reuse failure research storage with generalized case identity and withdrawal source kind. Selected quote is exact/live/owner scoped; links never fake platform merchants. Preserve old snapshot/material/job source behavior and erasure invalidation.
- [ ] Lesson explanations open same comparison workflow. Case/subject/context parsers and workspace render withdrawal names without allowing financial simulations on unsupported sources.
- [ ] RED browser lifecycle tests for erasure/focus/stale pages + actual fixture lesson→failure research; disclose no verified candidate and daily history.

## Task5 — Disabled bounded collection and daily trigger

Files: withdrawals collection-domain/executor/provider adapters/settings/tests, `lib/ai/business-withdrawals.ts`, existing cron/business-teardowns route and GitHub workflow tests if needed; new migration149 for job leases/receipts/settings only.

- [ ] RED default-disabled, owner-only, every actual search/fallback/fetch/analysis reservation, per-JSTday2/3/1 caps, noAI retry on unknown reply, race/replay/stop tests; dependency injection isolates providers.
- [ ] Implement official issuer allowlist and SSRF-safe source fetch using existing safe public fetch primitives; record provenance and rejected model fields in diagnostics. AI via existing facade/gateway, no private notes. Exact source validation before candidate admission.
- [ ] Settings show explicit separate budgets/public text/initial disabled state. Preparing code does not enable env/settings/provider calls. Daily select from verified queue can run with zero provider access.
- [ ] Wire existing cron invocation without increasing Vercel cron count; returning disabled/missing migration must not break legacy job step.

## Task6 — Review, verification, release

- [ ] Independent final spec and quality review; resolve findings with meaningful regression tests.
- [ ] Full `npm test`, `npx tsc --noEmit --incremental false --pretty false`, `npm run lint`; actual SQL scripts and mixed lifecycle. Baseline388 files/2511 tests passed. No local Next build during fixture server use.
- [ ] Fetch latest main, append146–149 SQL verbatim to schema.sql, inspect prod state/advisor baseline then apply in order; read-only owner/null/anon/private helper probes. Confirm new collection flags remain off.
- [ ] Commit/push authorized feature release preserving main; exact Production Vercel success, authenticated canonical UI read-only checks and screenshot; no invented production examples. Stop fixtures/reset viewport, accurate acceptance evidence.

Plan self-review: approved spec A/B/source deletion/cost boundary and existing research reuse all map to tasks. Spec revision is approved by user; this is execution detail, not another approval gate. Foundation can adjust DTO spelling only before UI task with one recorded shared-contract update, never silently change behavior.
