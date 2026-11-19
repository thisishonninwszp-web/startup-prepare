# 確認計画と調査結果の答え合わせ

User chose the recommended next feature: retain the original falsifier while appending what was actually checked, sources and how thinking changed. Approved scope is a manual comparison record, not an AI verdict, new demand signal, real validation, idea-state/activity update, scoring or notifications. Stay inside business-lab with no new first-level navigation or provider calls.

## Behavior

Saved plans link to `/business-lab/simulation/checks/results?caseId=UUID&planId=UUID&planRevision=N`. Select an owned saved plan version, read its question/falsifier/method/deadline and save timestamp, then independently write checkedOn, examined, found, sourceNote, optional sourceUrl and learned. Preview both sides, explicitly confirm and append. There is no automatic supported/refuted grade. Source links are pointers supplied by the user; no fetching or automatic proof check. HTTPS URLs only, no credentials, whitespace or unsafe schemes; offline sources use the required sourceNote without a URL.

checkedOn is the user's stated Tokyo calendar date (1900..2200, not future); createdAt is server time and cannot be supplied. If checkedOn predates the chosen version's Tokyo saved date, display a clear notice that the plan was recorded later, so this cannot be treated as a precommitted condition. Same-day order remains unproven; do not call it preregistration or blind validation.

Entries are append-only. New information or corrections are added as another entry; prior independent text is not overwritten. Explicit erase removes one result, retaining hash-only receipt tombstones. List/source/version pagination and exact record reopening are complete in this phase. No automatic learned method, experimental run, idea validation or real customer claim is created.

## Plan versions and erasure

139 adds private `business_reality_check_versions`, `business_reality_results`, `business_reality_result_receipts`. Capture own plan body/revision/updated_at after every plan insert/update, atomically in the existing137 command transaction. Seed only the currently available version of existing plans while locking the parent table against concurrent writes; older unavailable versions must not be reconstructed. These are independently authored plan fields, never simulation/report/source prose or case titles.

A result references plan_id/plan_revision and freezes that chosen version server-side as plan_snapshot plus plan_saved_at. Later plan edits do not change a saved result or invalidate the selected old version. Append requires the owned plan and chosen stored version to exist, but does not require a readable original simulation or case. User-owned result body remains readable after source loss.

Plan deletion atomically deletes its stored version prose and clears plan_snapshot in every dependent result (sets snapshot_erased_at). Keep only result's independent body, IDs and timestamp/version metadata. The snapshot is not a way to recover erased plan text. UI hides erased snapshots and still allows own result read/erase. Add an explanatory deletion note to the plan page. Receipt resolution happens before source rereads; after erasure, committed retries neither duplicate nor resurrect data. Trigger failure and137 receipt failure roll back both plan and snapshot erasure.

## Shared domain contracts

Core directory `lib/domains/business-teardowns/reality-results/`:

```ts
type RealityResultBody={checkedOn:string;examined:string;found:string;sourceNote:string;sourceUrl:string|null;learned:string};
// UTF16: examined3000, found6000, sourceNote3000, learned3000; URL2000. All prose trimmed/nonempty.
type RealityResultPlan={id:string;caseId:string;question:string;revision:number;createdAt:string;updatedAt:string;caseAvailable:boolean;caseTitle:string|null};
type RealityResultVersion={planId:string;caseId:string;revision:number;plan:RealityCheckPlan;savedAt:string;currentRevision:number;caseAvailable:boolean;caseTitle:string|null};
type RealityResultRecord={id:string;caseId:string;planId:string;planRevision:number;planSavedAt:string;planSnapshot:RealityCheckPlan|null;snapshotErasedAt:string|null;body:RealityResultBody;createdAt:string;revision:1;planCurrentRevision:number|null};
type RealityResultPage<T>={items:T[];nextCursor:string|null};
type RealityResultList=RealityResultPage<RealityResultRecord>&{available:boolean};
type RealityResultVersionPage=RealityResultPage<RealityResultVersion>;
type RealityResultCommand=
 |{operation:'append';id:string;requestId:string;planId:string;planRevision:number;body:RealityResultBody;confirmed:true}
 |{operation:'erase';id:string;requestId:string;expectedRevision:1};
```

Export types and `realityResultUuid`, `realityResultBodySchema`, `realityResultCommandSchema`. Body schema validates real dates/URLs; authoritative not-future check is also in SQL using Tokyo date. Source version is immutable; a later current plan revision does not reject an earlier selected stored version.

Transport:
- `listRealityResults(owner,input:{caseId?,planId?,before?}={})`→RealityResultList.
- `getRealityResult(owner,id)`→RealityResultRecord|null.
- `listRealityResultPlans(owner,input:{caseId?,before?}={})`→RealityResultPage<RealityResultPlan>.
- `listRealityResultVersions(owner,input:{planId,before?})`→RealityResultVersionPage.
- `getRealityResultVersion(owner,input:{planId,revision?})`→RealityResultVersion|null (default current version).
- `realityResultCommand(owner,input)`→`{id,revision}` (append1, erase2).

RPC `business_reality_result_read`: list/get/plans/versions/version. RPC command same prefix command: append/erase. result/plan pages20 keyset createdAt/id descending encoded base64url `{date,id}`; version pages20 revision descending encoded `{revision}`. Strict response schemas and requested/filter identity checks; only result list has expected missing139 fallback. Entry points require service_role plus explicit existing owner; no raw table grants, including service_role; helpers/triggers not directly callable.

## UI contract

Directory `app/(app)/business-lab/simulation/checks/results/`. Force-dynamic authenticated page with feature/session gate. Query caseId/planId/recordId/planRevision validated; mismatches unavailable, never open another result. Source version deep links work beyond first20 versions. Existing result reading is immutable; list open actions protect dirty new drafts. New identity includes selected plan+version/case, and same saved ID retains state on refresh.

`RealityResultsPanel` props:
`{initialState:RealityResultList,initialPlans:RealityResultPage<RealityResultPlan>,initialVersions:RealityResultVersionPage,initialSource?:RealityResultVersion|null,initialRecord?:RealityResultRecord|null,caseId?:string,planId?:string,initialPlanRevision?:number,today:string}`.

Actions: `realityResultsListAction(input={})`, `realityResultGetAction(id)`, `realityResultPlansAction(input={})`, `realityResultVersionsAction(input)`, `realityResultVersionAction(input)`, `realityResultSaveAction(command)`. Use matching transport above and owner from server session. Never trust owner from form.

Two columns on desktop (stacked on mobile): frozen plan version vs own research fields/read-only result. Initial empty state explains saving a plan first; missing/erased source distinct from unselected. Result dates/links labeled user-reported and unverified. Preview invalidates on any draft/source change. Pending requests pin payload and block edits/new IDs until explicitly reconciled. Lost response retries same command, saved-but-list-read failure distinct. No blind adoption of another record/revision.

Source erasure must not keep cached plan prose visible: passive focus/refresh hides snapshot until verified, and on failure keeps snapshot hidden while independent body remains. A version is stable across plan updates; no unnecessary stale warning for that case. Snapshot eradication updates are allowed even though result body is append-only. Source-deleted own results stay readable/erasable; creating a new entry from deleted source is blocked. HTTPS links use safe React anchor with noreferrer/noopener, never dangerous HTML.

Root adds saved-clean plan CTA + plan-deletion note, workspace kind `reality_result` exact path,140 read-only workspace union preserving all138 kinds and one global cursor, schema append. Workspace shows only independent learned/found text; no copied question/falsifier, nextCheck=null. Snapshot-erased items show source unavailable.

## Verification and release

TDD for old-version selection despite later edits; only-current migration backfill; capture and result append atomicity; two-owner/RLS/private helper grants; not-future date and late-record warning; safe URL limits; idempotency/tombstones; source deletion wipes all plan copies yet preserves independent result body; rollback of plan delete+erasure when137 receipt insert fails; tied pagination including result kind; exact query IDs; failed reads/pending recovery; no source prose after failed focus refresh; mobile and console. Use actual PGlite plus real-component synthetic browser writes, production reads only. Apply139 then140 before deployment, verify ACL and readonly owner/null/anonymous RPC contracts, preserve concurrent main work, follow actual Production deployment status (Preview status is insufficient), inspect logged-in canonical UI and save screenshot. No additional real provider requests or artificial personal production results.
