# Case Continuity Implementation Plan

> **For agentic workers:** Use dispatching-parallel-agents only for independently owned domains. Execute this domain task by task with TDD; root performs integration and independent review.

**Goal:** Resume exact saved operating work from the existing case and home pages.
**Architecture:** Read-only owner RPC projects bounded live summaries; existing tool pages resolve exact recordId through their existing owner readers. No new snapshots or decision writes.
**Tech Stack:** Next14/TypeScript/Supabase RPC/Vitest/PGlite, shared Field Notes components.

### Task1 — strict read contract and SQL
Files: create lib/domains/business-teardowns/workspace/{domain,transport}.ts and tests,postgres.integration.mjs;133_business_case_workspace.sql.
- [ ] RED: strict UUID/cursor/record-kind/href mapping and owner query tests. Example assertion: `expect(workspaceHref({kind:'cash',id,caseId})).toBe('/business-lab/cash?caseId='+caseId+'&recordId='+id)`; unknown kind/extra cursor fields reject.
- [ ] Implement summary contract `{kind,id,caseId,caseTitle,revision,updatedAt,title,excerpt,nextCheck,sourceAvailable}`; href comes from a fixed code map, never DB-supplied arbitrary URL. Methods preserve learning|lesson kind.
- [ ] SQL strict case/recent reads with20-row keysets, owner checks, bounded authored excerpts, live source invalidation, service-only execute and revoked helper access. Do not rely on direct table grants.
- [ ] GREEN `npx vitest run lib/domains/business-teardowns/workspace`; actual PGlite includes owned/other-owner, >20 mixed items, cursor ties, old source erase/change, zero writes to ideas/validations/activity.

### Task2 — exact continuation and stale-input protection
Files: app/(app)/business-lab/workspace/{actions.ts,workspace-panel.tsx} and tests; existing four tool pages/panels and tests.
- [ ] RED exact-record initial mount beyond first list page, missing/foreign record notice, query-case mismatch, focus conflict behavior preserving original revision. Reuse existing pressure hook-race harness pattern for meaningful interactive checks.
- [ ] Add optional initialRecord prop to each panel and initialize active/identity/draft from the exact owner-read record. Page recordId parsing is strict; explicit missing requested record does not fall through silently to another record.
- [ ] Implement cards with saved time, own next-check only, current source notices and fixed deep links. Full keyset/load-more with response generation guard and errors retaining current list.
- [ ] GREEN focused UI/actions/transport tests; scoped eslint and full TypeScript. Root integrates `<BusinessCaseWorkspace caseId={...}/>` and home resume after stable API handoff.

### Task3 — review and handoff
- [ ] Independently review source privacy, deep-link ownership, read races and boundedness. Fix confirmed defects with RED→GREEN regression.
- [ ] Report exact public props/API and final migration133 hash to root. Do not edit schema.sql, global entries, commit, deploy or call providers.
