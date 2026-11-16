# Operator learning extensions implementation plan

> **For agentic workers:** Execute the three independent bounded domains using dispatching-parallel-agents with exclusive file ownership. Root alone edits shared entries/schema.sql, commits, migrates and deploys. Every domain uses TDD and independent review before integration.

**Goal:** Complete remaining proposals②changed-condition practice,③hypothetical cash timing,④method counterexamples on existing business cases.

**Architecture:** Three independent owner-scoped RPC domains using existing cases/methods; no shared mutable implementation files between agents. Public sources resolve live; user-authored scenarios persist separately. AI only in explicit pressure-practice consent flow, single provider attempt per leased request.

**Tech Stack:** Next14/TypeScript/Tailwind/shadcn, Supabase PostgreSQL, Gemini through existing gateway, Vitest/PGlite.

## Task A — changed-condition practice

Files: pressure/{domain,transport}.ts and tests; lib/ai/business-pressure.ts/tests; app/(app)/business-lab/pressure/{page,pressure-panel}.tsx/actions.ts/tests;127_business_pressure.sql and isolated PostgreSQL integration.

- [ ] Write and run RED tests for strict plan payload, scenario templates marked hypothetical, owned cases, revision/replay, missing sources and complete CRUD.
- [ ] Implement `type PressurePlan={caseId:string;scenarioKey:string;changedCondition:string;action:string;tradeoff:string;checkNext:string}` with strict Zod; action owner comes from authenticated session; uncached RPC service guard and matching SQL limits.
- [ ] RED AI tests: quoted answer substring required; no scores/facts; duplicate/unknown request never resends; changed response/withdrawn consent cannot finish. Implement lease claim→one gateway call→revalidate→finish, isolated invalid-response diagnostics.
- [ ] GREEN domain/gateway/action/UI tests and actual127 PGlite migration tests; full input/reload/edit/delete, explicit consent preview and prior-version labels.

## Task B — hypothetical cash timing

Files: cash/{domain,transport}.ts/tests; app/(app)/business-lab/cash/{page,cash-panel}.tsx/actions.ts/tests;128_business_cash_timing.sql/integration.

- [ ] RED exact integer arithmetic, valid date, currency parsing, same-day aggregation, earliest negative day, max200 entries, overflow and baseline/alternative tests. Example invariant: with100 opening, same-day200out+150in closes50 and must not report a daily deficit.
- [ ] Implement strict `Flow={id:string;date:string;label:string;direction:'in'|'out';amountMinor:number;assumption:string}`. Store only source assumptions; compute trajectory in shared pure code on read/display, never accept calculated totals from client.
- [ ] Implement full owner/version/replay CRUD RPC and case options; input counts/amounts/dates enforced in SQL too. Complete editable baseline/alternative UI and transparent ledger, no providers.
- [ ] GREEN focused tests and actual128 integration: RLS/service/owner, malformed payloads, concurrent edits, replay-after-delete, pagination, source unavailable and no validation writes.

## Task C — counterexamples for confirmed methods

Files: counterexamples/{domain,transport}.ts/tests; app/(app)/business-lab/counterexamples/{page,counterexamples-panel}.tsx/actions.ts/tests;129_business_method_counterexamples.sql/integration.

- [ ] RED confirmed-method/case ownership, method hash changed/erased, no copied source text, CRUD/version/replay and bounded source-picker tests.
- [ ] Implement strict comparison/candidate method schema and live method baseline hash; record user-authored comparison only. Render stale baseline clearly without replacing historical context.
- [ ] RED explicit adoption: unconfirmed/changed/unavailable source rejects; confirmed proposal calls existing122 method append in same transaction; retry does not duplicate and rollback is atomic.
- [ ] GREEN full plan/read/edit/delete/adopt UI and real119/120/122/129 PostgreSQL integration. No automatic method adoption or provider/validation writes.

## Root integration and delivery

- [ ] Independent spec then quality review of each domain. Check response races and unsaved input retention, following fixes in existing practice editor.
- [ ] Add one existing business-lab secondary tool group and case-specific entries; reuse case id links to existing making practice. Add appropriate method-library entry. No first-level nav.
- [ ] Append final127/128/129 SQL verbatim to schema.sql; verify TypeScript, ESLint, full Vitest and each real PostgreSQL integration. No local Next build while dev server runs.
- [ ] Test actual components with isolated synthetic browser actions and mobile width; provider stubs only, no invented production personal records.
- [ ] Apply migrations and inspect RLS/RPC/owner contracts in production. Deploy scoped commits and verify final Vercel status and logged-in UI. Record real vs synthetic boundaries and leave no required work unchecked.
