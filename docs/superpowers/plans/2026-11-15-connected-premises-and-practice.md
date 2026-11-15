# Connected premises and practice implementation plan

> **For agentic workers:** Use subagent-driven-development for implementation and independent spec/quality review. Do not modify unrelated dirty files. Track each step below.

**Goal:** Link personally confirmed shared assumptions to news and existing objects; turn a business case into a saved, revisitable making exercise.

**Architecture:** Two bounded domains with owner-scoped transactional RPCs; no AI or scheduler additions. References resolve current ownership/content on read instead of storing source copies. Existing workbench and business-case routes supply secondary entrances.

**Tech Stack:** Next.js14 App Router, TypeScript, Tailwind/shadcn, Supabase PostgreSQL, Vitest/PGlite.

## Task 1: Common premises

Files: create `lib/domains/premises/{domain,commands,queries}.ts`, tests; `app/(app)/workbench/premises/{page,actions,premises-panel}.tsx` (server actions in actions.ts), `supabase/migrations/125_shared_premises.sql`; modify workbench/page.tsx and append migration verbatim to supabase/schema.sql.

- [ ] RED: owner mismatch, unknown targets, idempotent replay/payload conflict, revision conflict, source disappears, literal matching and pagination tests. Target logical contract: `type TargetKind='idea'|'business_case'|'method'; type Premise={id:string;revision:number;text:string;invalidator:string;keywords:string[]}`. No client-provided owner.
- [ ] Implement strict input parsers and RPC boundary: authenticated server action obtains `user.id`; client helpers call `supabaseAdminUncached.rpc('shared_premise_command',{p_user_id:owner,p_operation:operation,p_input:input})`. Use service-role guard and owner checks inside SQL; receipts contain identifiers/digests only.
- [ ] GREEN: `npm test -- lib/domains/premises` and actual125 PGlite integration. Reads resolve references live; missing source is not zero relevant news. Search terms are literal, never interpreted as regex or SQL filters.
- [ ] Build create/edit/delete/attach/unlink/review flows, restore inputs on errors, retain request ID until same logical mutation completes. Render matching news as candidate; user confirmation and rationale required for review. Scope phrase warns no automatic invalidation.
- [ ] Independent spec review, then quality review; fix actionable findings before integration.

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
