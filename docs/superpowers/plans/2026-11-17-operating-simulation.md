# Operating Simulation Implementation Plan

> **For agentic workers:** Execute this isolated domain with TDD and independent review under dispatching-parallel-agents. Root alone integrates shared files and deployment.

**Goal:** Carry explicit hypothetical choices through six deterministic rounds of cash, stock and delivery commitments.
**Architecture:** Pure replay engine over confirmed setup+append-only authored actions; SQL repeats strict input/action bounds, RPC keeps optimistic/idempotent histories, no provider or decision-state writes.
**Tech Stack:** TypeScript/Zod/Next14/Supabase/Vitest/PGlite.

### Task1 — deterministic replay engine
Files: simulation/{domain,engine}.ts and tests. Follow setup/action fields and operation order in the matching spec exactly.
- [x] RED: initial stock no duplicate cash expense; lead0/current arrivals and lead1/2 future arrivals; future schedule changes do not rewrite prior deliveries; channel/capacity changes at rounds3/4.
- [x] RED: FIFO cancellation/shipping, prepaid refunds vs shipment payments, ship stock/capacity bounds, order cap, overdue due-next-round units, negative cash visible, six-round ceiling, date and safe-integer bounds. Example: opening1000, unitCost100, buy2 lead0, accept1 prepaid300, ship1 cost20 -> close1080, stock1, outstanding0.
- [x] Implement pure `replaySimulation(setup,turns)`; every returned state derives from exact integer inputs, no random events, AI labels, forged stored outcomes or scores.
- [x] GREEN engine and strict unknown-key tests; ensure performance is bounded by6 turns and capped units, not per-unit object allocation.

### Task2 — atomic append/replay persistence
Files: simulation/{transport.ts,postgres.integration.mjs} and tests;135_business_operating_simulation.sql.
- [x] RED owner/RLS, strict setup/turn parser-SQL parity, append-only decisions, optimistic conflicts, same-request replay, erased-id recreation, changed source title/missing case, pagination and zero unrelated writes.
- [x] Implement create/turn/erase RPC commands and read case/list/get operations. Receipts contain ids/hashes only. SQL rejects computed-output keys and invalid actions, replays bounded inputs before accepting the next turn.
- [x] GREEN actual135 integration with minimal live-case dependencies; arithmetic/order invariants match TS engine fixture outputs.

### Task3 — complete operating exercise UI
Files: app/(app)/business-lab/simulation/{page.tsx,actions.ts,simulation-panel.tsx} and tests.
- [x] RED required explicit hypothetical setup/confirmation, visible full event schedule, each decision reason/checkNext, frozen prior turns, copy-to-new-setup, response-loss retry without duplicate rounds, remote compare, erase confirmation, owner source missing and migration missing states.
- [x] Implement exact-record/case deep links and full saved-list pagination. Render cash/inventory/order ledger with current arithmetic and hypothetical labels, final own-choice recap after6 rounds, no grade or claim of real demand/ability.
- [x] Link same case to cash/pressure/practice only. If export to cash is implemented, show full preview and separate explicit save; do not auto-write. Export is not required for a complete six-round workflow and must not be claimed if absent.
- [x] Independent review, focused tests/eslint/full TypeScript/actualSQL. Hand final135 hash and workspace summary API to root; no shared files, commits, providers or production mutations.
