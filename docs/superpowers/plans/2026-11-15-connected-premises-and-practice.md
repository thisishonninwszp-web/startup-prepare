# Connected premises and practice implementation plan

> **For agentic workers:** Use subagent-driven-development for implementation and independent spec/quality review. Do not modify unrelated dirty files. Track each step below.

**Goal:** Link personally confirmed shared assumptions to news and existing objects; turn a business case into a saved, revisitable making exercise.

**Architecture:** Two bounded domains with owner-scoped transactional RPCs; no AI or scheduler additions. References resolve current ownership/content on read instead of storing source copies. Existing workbench and business-case routes supply secondary entrances.

**Tech Stack:** Next.js14 App Router, TypeScript, Tailwind/shadcn, Supabase PostgreSQL, Vitest/PGlite.

## Task 1: Common premises

Files: create `lib/domains/premises/{domain,commands,queries}.ts`, tests; `app/(app)/workbench/premises/{page,panel}.tsx` and `actions.ts`, `supabase/migrations/125_shared_premises.sql`; modify workbench/page.tsx and append migration verbatim to supabase/schema.sql.

- [x] RED: owner mismatch, unknown targets, idempotent replay/payload conflict, revision conflict, source disappears, literal matching and pagination tests. Contract: `type TargetKind='idea'|'business_case'|'method'; type Premise={id:string;revision:number;text:string;invalidWhen:string;keywords:string[];createdAt:string}`. No client-provided owner.
- [x] Implement strict input parsers and RPC boundary: authenticated server action obtains `user.id`; client helpers call `supabaseAdminUncached.rpc('shared_premise_command',{p_user_id:owner,p_operation:operation,p_input:input})`. Use service-role guard and owner checks inside SQL; receipts contain identifiers/digests only.
- [x] GREEN: 13 scoped tests and actual125 PGlite integration. Reads resolve references live; missing source is not zero relevant news. Search terms are literal, never interpreted as regex or SQL filters.
- [x] Build create/edit/delete/attach/unlink/review flows, restore inputs on errors, retain request ID until same logical mutation completes. Render matching news as candidate; user confirmation and rationale required for review. Scope phrase warns no automatic invalidation.
- [x] Independent spec review, then quality review; selection/source generation and deleted-news cache findings fixed and approved.

Task1 verification: full working-tree run at phase1 checkpoint 320 files/2083 tests; tsc/lint exit0. Actual109/119/120/121/122+125 chain also passed with real confirmed-method and case targets. Synthetic browser confirmed lost-response retry is1write/1record, links/review and missing-news redaction;391px mobile displayed without clipped form controls. 125 appended verbatim to schema.sql. Production125 executed in SQL Editor after source hash+editor text match; all4 tables RLS=true and anon/authenticated direct RPC=false. Production read-only list available=true,0personal records, owner guard42501. No production synthetic writes or provider calls.

## Task 2: Business making practice

Files: create `lib/domains/business-teardowns/practice/{domain,commands,queries}.ts`, tests; `app/(app)/business-lab/practice/{page,actions,practice-panel}.tsx` (actions.ts); `supabase/migrations/126_business_making_practice.sql`; add business case and lab secondary entrances; append migration verbatim to schema.sql.

- [ ] RED: template contains no fabricated personal/market facts; saves plan/result with request/revision safety; owner/source/research mismatch; deletion and stale source; artifact HTTP(S) validation; bounded page tests.
- [ ] Implement domain plus RPC. Core input: `{caseId,reportId:null|string,apprenticeshipId:null|string,title,objective,deliverable,checkMethod,plannedMinutes,constraints}`. Result: `{artifactDescription,artifactUrl:null|string,actualMinutes,obstacle,nextChange}`. Treat all text as user-authored; no imported report prose or third-party customer excerpts.
- [ ] GREEN: focused Vitest and126 PGlite tests. Validate optional report belongs to exact case/user and is readable at save; apprenticeship owned/type correct. Outcome does not mutate ideas/validations/career_entries.
- [ ] Build complete plan save/reload/edit, outcome save/reload/edit, delete and list pagination; template application explicit and editable. Render current source links with missing-source notice; source changes cannot silently relabel record.
- [ ] Independent spec review, then quality review; fix actionable findings.

## Task 3: Verify and deliver

- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, actual migrations SQL integrations. No local build while dev server is running.
- [ ] Review auth, stale references, errors, comments, mobile flow and accidental provider/decision writes. Commit only scoped files.
- [ ] Apply125/126 production migrations through available authenticated Supabase capability if authorized and accessible; otherwise give exact migration paths and keep existing modules healthy. Do not call providers to demonstrate features.
- [ ] Deploy after checks when migrations permit production use; verify actual deployment result. Record completed and outstanding scope truthfully, including remaining②③④.
