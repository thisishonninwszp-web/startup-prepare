# Cash Boundaries Implementation Plan

> **For agentic workers:** Use dispatching-parallel-agents for this isolated domain; follow TDD and independent review. Root integrates shared entries/schema and deploys.

**Goal:** Save explicit one-variable cash ranges and reveal exact modeled daily-close shortfall transitions.
**Architecture:** Reuse existing cash calculator, parser and owner DTO; persist range+source revision only. Strict RPC guards validate source/version; stale analyses never reuse old calculations.
**Tech Stack:** TypeScript/Zod/Next14/Supabase/Vitest/PGlite.

### Task1 — exact boundary calculator
Files: lib/domains/business-teardowns/boundaries/{domain,calculate}.ts and tests.
- [x] RED money monotonic transitions, zero threshold, all/none negative, inflow/outflow direction, same-day aggregates, range max1e12. Fixture: opening100 and one outgoing flow; varying its amount from0..300 yields last nonnegative100 and first negative101; assert the actual daily close at both adjacent values.
- [x] RED date nonmonotonic intervals and leap dates,366 inclusive bound, invalid start-before-source dates, missing flow id, unchanged source and exact integer arithmetic.
- [x] Implement strict variable union `{kind:'opening',minMinor,maxMinor}|{kind:'amount',flowId,minMinor,maxMinor}|{kind:'date',flowId,from,to}` plus side baseline|alternative. Binary-search money using known sign monotonicity; exhaustively enumerate dates and coalesce every negative interval.
- [x] GREEN focused calculator tests; do not compute or persist idea/business scores or unknown actual costs.

### Task2 — complete owner/source revision persistence
Files: boundaries/{transport.ts,postgres.integration.mjs} and tests;134_business_cash_boundaries.sql.
- [x] RED CRUD/revision/replay/tombstones, strict input/response parity, source change/delete, ownership, case-scoped list and source picker pagination. Payload is `{cashId,cashRevision,side,variable,title}`; computed output is not accepted or stored.
- [x] Implement service-only read/command RPC; helpers/records/receipts have no direct client grants. Use uncached client and authenticate actions from Supabase getUser.
- [x] GREEN actual134 integration with actual131 or matching minimal cash schema, concurrent mutation and erased-id retry. Compare JS UTF16/trim/UUID limits to SQL.

### Task3 — usable workflow
Files: app/(app)/business-lab/cash/boundaries/{page.tsx,actions.ts,boundary-panel.tsx} and tests.
- [x] RED saved range reload, lost-response retry, stale source blocks result and requires explicit rebasing/new analysis, no automatic adopting remote revisions, record switching/read race, source option beyond first page.
- [x] Implement source/range form, complete transparent boundary output, saved-list/edit/delete/replay, source warning and missing-migration isolated state. API uses plain typed results/throws like existing cash tools.
- [x] Independent spec/quality review; fix regressions, scoped tests/eslint/full TypeScript and actualSQL. Hand final schema134 hash/API to root; no shared file changes, commits, providers or production actions.
