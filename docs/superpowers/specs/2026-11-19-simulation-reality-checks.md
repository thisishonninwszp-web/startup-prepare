# シミュレーションから現実の確認計画へ

User selected the recommended proposal on2026-11-19: turn a question from a saved simulation round into a personally confirmed plan with falsifier, method and deadline. This is the approved scope, within existing business-lab; no new first-level navigation, AI or visitor tracking.

## Workflow

From any saved simulation with at least one committed round, open `/business-lab/simulation/checks?simulationId=UUID&caseId=UUID`. Select one saved round, read the user's original reason/checkNext live, and write four independent fields: question, falsifier, method, dueDate. Preview exactly these fields and the selected source, then explicitly confirm before save. Never invent a question or copy a merchant report into the plan automatically. Saving a plan does not mean the question is answered.

The page supports paged saved plans and paged simulation sources (20 each), exact record links, editing, explicit deletion, unavailable-source notices and same-request recovery. Plan CRUD is complete in this phase; running experiments, deciding real pain/payment and grading outcomes are outside this proposal. There is no new reminder service. Deadline/overdue labels use Asia/Tokyo and do not change idea activity or locks.

## Data and source rules

New137 tables: business_reality_checks and business_reality_check_receipts. A plan stores only id/user_id/case_id/simulation_id/round/source_revision/plan/revision/timestamps. Source reference is immutable after create. Source_revision is captured on the server, not accepted from the client. Append-only simulation rounds stay valid when later rounds are appended; current whole-simulation revision equality is not required. Round must already exist. Create requires same-owner simulation and readable owned case; updates may edit the independent plan after the simulation/case disappears. Source disappearance hides missing source text without deleting the independent plan. Hash-only receipts survive erase as tombstones; committed retries are checked before source rereads, cannot duplicate a plan, and cannot resurrect an erased ID.

The source reason/checkNext, title and case title resolve live, never persist as copies in the plan. Case title is not a fact extracted from the simulation. All displayed simulation content is marked hypothetical and is not real validation. No validations, ideas.status/last_activity_at, careers, learned methods or existing locks are written.

## Shared TypeScript contracts

Domain directory `lib/domains/business-teardowns/reality-checks/`:

```ts
type RealityCheckPlan={question:string;falsifier:string;method:string;dueDate:string};
// Nonempty trimmed UTF-16 limits: question1000, falsifier/method3000; real YYYY-MM-DD1900..2200.
type RealityCheckSource={id:string;caseId:string;title:string;revision:number;turns:{reason:string;checkNext:string}[];caseAvailable:boolean;caseTitle:string|null};
type RealityCheckSourceSummary=Omit<RealityCheckSource,'turns'>&{roundCount:number};
type RealityCheckSourceState={available:boolean;title:string|null;currentRevision:number|null;reason:string|null;checkNext:string|null;caseAvailable:boolean;caseTitle:string|null};
type RealityCheckRecord={id:string;caseId:string;simulationId:string;round:number;sourceRevision:number;plan:RealityCheckPlan;revision:number;createdAt:string;updatedAt:string;source:RealityCheckSourceState};
type RealityCheckPage<T>={items:T[];nextCursor:string|null};
type RealityCheckList=RealityCheckPage<RealityCheckRecord>&{available:boolean};
type RealityCheckSourcePage=RealityCheckPage<RealityCheckSourceSummary>;
type RealityCheckCommand=
 |{operation:'save';id:string;requestId:string;expectedRevision:number;simulationId:string;round:number;plan:RealityCheckPlan;confirmed:true}
 |{operation:'erase';id:string;requestId:string;expectedRevision:number};
```

Export `realityCheckUuid`, `realityCheckPlanSchema`, `realityCheckCommandSchema` and the above types from domain.ts. `round`1..6, record/source_revision2..7, plan revision positive32-bit. Owner and foreign record IDs never come from a client-supplied owner.

Transport functions:
`listRealityChecks(owner,input:{caseId?,simulationId?,before?}={})`, `getRealityCheck(owner,id)`, `listRealityCheckSources(owner,input:{caseId?,before?}={})`, `getRealityCheckSource(owner,id)`, `realityCheckCommand(owner,input)` → `{id,revision}`. Cursors use base64url encoded `{date,id}`, creation date/id descending. Read RPC `business_reality_check_read` operations list/get/sources/source; command RPC `business_reality_check_command` save/erase. All DTOs strict Zod; missing137 returns available=false only for plan list, other unexpected errors remain visible. Receipt ID/revision and requested entity identity are checked on return.

## UI and integration

UI directory `app/(app)/business-lab/simulation/checks/`: authenticated force-dynamic page, actions, `RealityChecksPanel`. Props: `{initialState:RealityCheckList,initialSources:RealityCheckSourcePage,initialRecord?:RealityCheckRecord|null,initialSource?:RealityCheckSource|null,initialRound?:number,caseId?:string,simulationId?:string,today:string}`. today is Tokyo YYYY-MM-DD supplied by server.

Actions: `realityChecksListAction(input={})`, `realityCheckGetAction(id)`, `realityCheckSourcesAction(input={})`, `realityCheckSourceAction(id)`, `realityCheckSaveAction(command)`. Feature uses existing businessTeardownsEnabled gate and existing session check. Page validates optional simulationId/caseId/recordId/round; reject mismatched valid record/source/case instead of opening a different plan. New editor identity includes source/case/round; saved identity excludes revision to retain dirty input on refresh. Source selection and round changes reset preview; any edited plan resets confirmation. Save failures keep input and original pending request; retry cannot switch to another plan. Focus refresh compares remote revisions without silent adoption. Erase remains possible after source loss.

Root adds simulation entry (only committed rounds), workspace kind `reality_check`, exact plan links and138 read-only workspace integration; an overdue dueDate is shown as a deterministic date label, not a score. Keep a single case/recent keyset ordering. Append reviewed137/138 SQL verbatim to schema.sql.

## Acceptance and release

TDD for invalid/missing fields, dates, owner isolation, unreadable source/round, append does not stale earlier round, source deletion preserves own plan, immutable anchor, optimistic conflicts, payload-bound receipts, tombstones, strict cursors and multiple pages. Actual PostgreSQL tests verify no idea/validation/activity effects, RLS/direct grants and forced rollback. UI tests cover preview/edit reset, lost response/retry, record navigation, same-record dirty input, missing source and conditional absence of source prose. Use real components with synthetic actions for mutations; production validation is read-only, no personal test plans or provider calls. Apply migrations before releasing code, verify ACL/RPC contracts, merge preserving concurrent main work, wait for Vercel success, then inspect authenticated production entry/empty state. User's continued release authorization remains applicable.
