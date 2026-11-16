# Operator learning extensions implementation plan

> **For agentic workers:** Execute the three independent bounded domains using dispatching-parallel-agents with exclusive file ownership. Root alone edits shared entries/schema.sql, commits, migrates and deploys. Every domain uses TDD and independent review before integration.

**Goal:** Complete remaining proposals②changed-condition practice,③hypothetical cash timing,④method counterexamples on existing business cases.

**Architecture:** Three independent owner-scoped RPC domains using existing cases/methods; no shared mutable implementation files between agents. Public sources resolve live; user-authored scenarios persist separately. AI only in explicit pressure-practice consent flow, single provider attempt per leased request.

**Tech Stack:** Next14/TypeScript/Tailwind/shadcn, Supabase PostgreSQL, Gemini through existing gateway, Vitest/PGlite.

## Task A — changed-condition practice

Files: pressure/{domain,transport}.ts and tests; lib/ai/business-pressure.ts/tests; app/(app)/business-lab/pressure/{page,pressure-panel}.tsx/actions.ts/tests;130_business_pressure.sql and isolated PostgreSQL integration.

- [x] Write and run RED tests for strict plan payload, scenario templates marked hypothetical, owned cases, revision/replay, missing sources and complete CRUD.
- [x] Implement `type PressurePlan={caseId:string;scenarioKey:string;changedCondition:string;action:string;tradeoff:string;checkNext:string}` with strict Zod; action owner comes from authenticated session; uncached RPC service guard and matching SQL limits.
- [x] RED AI tests: quoted answer substring required; no scores/facts; duplicate/unknown request never resends; changed response/withdrawn consent cannot finish. Implement lease claim→one gateway call→revalidate→finish, isolated invalid-response diagnostics.
- [x] GREEN domain/gateway/action/UI tests and actual130 PGlite migration tests; full input/reload/edit/delete, explicit consent preview and prior-version labels.

## Task B — hypothetical cash timing

Files: cash/{domain,transport}.ts/tests; app/(app)/business-lab/cash/{page,cash-panel}.tsx/actions.ts/tests;131_business_cash_timing.sql/integration.

- [x] RED exact integer arithmetic, valid date, currency parsing, same-day aggregation, earliest negative day, max200 entries, overflow and baseline/alternative tests. Example invariant: with100 opening, same-day200out+150in closes50 and must not report a daily deficit.
- [x] Implement strict `Flow={id:string;date:string;label:string;direction:'in'|'out';amountMinor:number;assumption:string}`. Store only source assumptions; compute trajectory in shared pure code on read/display, never accept calculated totals from client.
- [x] Implement full owner/version/replay CRUD RPC and case options; input counts/amounts/dates enforced in SQL too. Complete editable baseline/alternative UI and transparent ledger, no providers.
- [x] GREEN focused tests and actual131 integration: RLS/service/owner, malformed payloads, concurrent edits, replay-after-delete, pagination, source unavailable and no validation writes.

## Task C — counterexamples for confirmed methods

Files: counterexamples/{domain,transport}.ts/tests; app/(app)/business-lab/counterexamples/{page,counterexamples-panel}.tsx/actions.ts/tests;132_business_method_counterexamples.sql/integration.

- [x] RED confirmed-method/case ownership, method hash changed/erased, no copied source text, CRUD/version/replay and bounded source-picker tests.
- [x] Implement strict comparison/candidate method schema and live method baseline hash; record user-authored comparison only. Render stale baseline clearly without replacing historical context.
- [x] RED explicit adoption: unconfirmed/changed/unavailable source rejects; confirmed proposal calls existing122 method append in same transaction; retry does not duplicate and rollback is atomic.
- [x] GREEN full plan/read/edit/delete/adopt UI and real119/120/122/132 PostgreSQL integration. No automatic method adoption or provider/validation writes.

## Root integration and delivery

- [x] Independent spec then quality review of each domain. Check response races and unsaved input retention, following fixes in existing practice editor.
- [x] Add one existing business-lab secondary tool group and case-specific entries; reuse case id links to existing making practice. Add appropriate method-library entry. No first-level nav.
- [x] Append final130/131/132 SQL verbatim to schema.sql; verify TypeScript, ESLint, full Vitest and each real PostgreSQL integration. No local Next build while dev server runs.
- [x] Test actual components with isolated synthetic browser actions and mobile width; provider stubs only, no invented production personal records.
- [x] Verify user-applied130/131/132 in production through owner list/options RPCs, null-owner denial, anonymous RPC denial and direct-table ACL checks matching the reviewed migration. RLS is enabled in the reviewed/tested migration SQL; catalog flags were not separately queried in production.
- [x] Deploy scoped commits to main and verify Vercel production deployment success.
- [x] Verify the logged-in production pages after the user signs into the in-app browser. Record real vs synthetic boundaries and leave no required work unchecked.

## Release checkpoint (2026-11-16)

- All three implementations and independent reviews complete. Pressure review repaired open/focus lock, pre-start consent withdrawal, arbitrary factual AI prose, and deleted-ID reuse.
- AI selects only a controlled question key plus exact own-answer quote; wording comes from code and an identical SQL whitelist. No real provider call was made.
- Final migrations are130/131/132;127 was allocated by a separate main commit. No migration in this release has been applied to production yet.
- Fresh pre-integration verification:339 Vitest files /2159 tests, TypeScript, ESLint and actual130/131/132 PostgreSQL integration pass.
- Chrome extension calls still time out and cannot operate the signed-in production pages. Local browser verification succeeded through the in-app browser using the actual final components and synthetic action boundaries (no production DB/provider): all three lost-response retries, pressure consent preview and code-selected question display/old-version labels, explicit counterexample source selection and complete adoption preview/two-step confirmation, source-loss draft retention, deletion confirmations and notices, and391px viewport with no document-level horizontal overflow. All three browser consoles had no errors. Screenshot retained locally under untracked .tmp/operator-browser/cash-verified.jpg. Manual production SQL execution has been requested. Local synthetic harness is not part of the release.
- Do not claim production rollout complete until DB probes, Vercel build/deployment and logged-in page checks are verified.

- After rebase onto main d3c8e7d:341 Vitest files /2166 tests, TypeScript and ESLint pass. All three migration integration scripts pass with final130/131/132 filenames. Feature commit c938efa is pushed to origin/codex/operator-lab; Vercel preview status success (deployment9Zsj4sazy5LpxrAttenVLHPffiNQ). Main remains unchanged by this release.

## Production checkpoint (2026-11-17; supersedes pending rollout above)

- User reported execution. Production read probes confirm all three RPC domains are present; the active configured job owner's lists are empty and owned case options load (pressure9, cash9, counterexamples1). No personal practice records or provider requests were created.
- All three null-owner and anonymous reads are rejected; all four anonymous command/AI entrypoints are denied. Anonymous direct access to all ten new tables is denied. Pressure/cash service-role direct access is denied; counterexample tables intentionally retain the service-role grant defined in132. Production permission probes match these respective contracts.
- Fresh release checks:341 files /2166 tests pass, full TypeScript and ESLint clean.
- Pushed main from d3c8e7d to a15e616fc64271057bd085693aeb28568b5996d4. Vercel production deployment8AVMA6F9rvg1BTQKssq2LgcJn9sq reports success.
- Canonical site opened in the in-app browser; unauthenticated access correctly redirected to login. The initial deployment checkpoint required a user login; authenticated acceptance is now complete as recorded below. No real Gemini send was performed.

## Final authenticated acceptance (2026-11-17)

- After the user logged in, reloaded the pre-deployment browser tab and confirmed the new operator tool group on the canonical `/business-lab` page. Opened all three production routes successfully with their live owner-scoped source options and correct empty states.
- Exercised real authenticated read actions: pressure/cash list refresh, counterexample list refresh and method search. No read errors or nonempty alerts occurred. The method library is currently empty; source adoption and saving correctly remain disabled until a confirmed method is selected. No fake method was added to bypass this boundary.
- Verified a readable existing case exposes all four case-specific tool links. Pressure, cash and counterexample routes each preserve the selected case ID and live title. The confirmed-method deep-link write workflow was tested with synthetic UI and actual PostgreSQL integration, not by inventing personal methods in production.
- On the active test tab at a391px viewport, all three new production routes had clientWidth376 /scrollWidth376. Reset the viewport afterward. All four inspected production tab consoles had zero error entries.
- Saved the actual production screenshot locally at `.tmp/operator-browser/operator-lab-production.jpg`; kept the canonical business-lab tab as the user-facing result and closed temporary verification tabs. Production checks made no practice/assumption/study writes and no provider calls. All planned implementation and rollout work is complete.
