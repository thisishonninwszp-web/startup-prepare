# 調査結果から次の確認計画へ

User approved: independently edit a new question, falsifier, method and deadline while referencing a saved own reality-result; keep original plan and result. Continue implementation and release in this session. No AI, grade, automated demand validation, new idea status/activity/lock changes or new first-level navigation.

## Chosen design

Use existing `business_reality_checks` for all independently authored plans, so139 version capture/results work for follow-up plans too.141 adds nullable `origin_result_id`; simulation_id/round/source_revision become nullable, with an exact-one-origin CHECK. Existing rows remain simulation plans. New dedicated domain/RPC and `/business-lab/simulation/checks/next` isolate the two authoring workflows without changing old TypeScript contracts or inventing simulations.142 extends the existing workspace with `followup_check` and excludes follow-ups from the old simulation-plan branch. No duplicate plan rows in workspace.

Alternatives considered: requiring original simulation to create another plan would fail when a readable result survives source erasure; a separate plan storage table would duplicate139 versions/results logic. The chosen shared plan table preserves both independent ownership and existing result recording.

## Behavior and privacy

Saved result page has `根据这条结果写下一份确认计划` only for a saved active result with no pending write/busy state. This links exact caseId/resultId; it does not create/prefill/save a plan. New route shows the result's own checkedOn/examined/found/sourceNote/sourceUrl/learned, never cached original plan snapshots or simulation/report prose. All four new plan fields start empty. Preview then explicit save.

The saved new plan has an immutable resultId origin. Editing changes only its own four fields/revision; prior versions stay available through139. Results are immutable so no copied source body/version is needed. Source body resolves live; focus/refresh hides it before verification and failed/null reads keep it hidden, retaining manual draft. Source erasure never erases independently authored follow-up plan text. New plan creation requires owned readable result but not its prior plan/simulation/case. Once saved, plan edit/erase remains available after source loss. New child plans can themselves receive result records, continuing the loop without adding a status or automatic completion flag.

Result/source IDs and case filters are exact on page, transport and SQL. Read-only source links do not fetch URLs. Sources and saved plans have bounded20-item keysets and exact get. Dirty switches require confirmation; preview invalidates on edits. Busy operations cannot be invalidated by focus. Lost responses pin exact command/body/id/requestId; retry receipt-first, no automatic new IDs. After a pending initial save whose source disappeared, only exact get-null→exact source-null→exact get-null plus explicit confirmation may release pending while preserving draft. Updates with conflicts compare latest and explicitly adopt; source ownership/anchor never changes. Erase removes cached own prose immediately before fallible list refresh; successful exact null read clears the cached saved plan body, while actual failed reads preserve independent draft/body and hide source text.

## Shared API

New `lib/domains/business-teardowns/followup-checks/` exports:

```ts
type FollowupCheckSource={id:string;caseId:string;body:RealityResultBody;createdAt:string};
type FollowupCheckRecord={id:string;caseId:string;resultId:string;plan:RealityCheckPlan;revision:number;createdAt:string;updatedAt:string;source:FollowupCheckSource|null};
type FollowupCheckPage<T>={items:T[];nextCursor:string|null};
type FollowupCheckList=FollowupCheckPage<FollowupCheckRecord>&{available:boolean};
type FollowupCheckCommand=
 |{operation:'save';id:string;requestId:string;expectedRevision:number;resultId:string;plan:RealityCheckPlan;confirmed:true}
 |{operation:'erase';id:string;requestId:string;expectedRevision:number};
```

Export `followupCheckUuid`, `followupCheckCommandSchema` and types above. Reuse existing plan/body types and validators. Save expectedRevision0..2147483646; erase1..2147483646; read revision1..2147483647. `listFollowupChecks(owner,{caseId?,resultId?,before?}={})`; `getFollowupCheck(owner,id)`; `getFollowupCheckSource(owner,id)`; `followupCheckCommand(owner,command)` returns{id,revision}. Only list catches expected missing141 and returns availablefalse. Strict response shape, owner UUID, requested id/filter/cursor identity and ordering checks. Source DTO deliberately excludes original plan snapshot.

RPC `business_followup_check_read` operations list/get/source; `business_followup_check_command` save/erase, service-only owner guards. Shared137 plan receipts and advisory lock seed137 preserve cross-operation idempotency/tombstones/ID namespace; receipt-first resolution is before source existence/revision. Creation locks source result for share against139 erase; new caseId derived only from source. No FK to source result (metadata pointer survives erase). No persistent source-body copies. Existing137 commands reject follow-up IDs; old get/list exclude follow-up rows, keeping old strict DTOs intact. Capture139 triggers still enforce immutable own plan snapshots and atomically clear those snapshots on plan deletion. Both delete pathways rollback if receipt insert fails.

## UI contracts and integration

`FollowupChecksPanel` props: `{initialState:FollowupCheckList,initialSources:RealityResultList,initialRecord?:FollowupCheckRecord|null,initialSource?:FollowupCheckSource|null,caseId?:string,resultId?:string,today:string}`. Source list from existing result list, labels only checkedOn and metadata ID; actual body shown only after exact fresh read. Fixed resultId scope retained for new plan/reset; no silent switch to another source. Saved plan link to existing result page uses caseId/planId/planRevision. Return link to originating result's exact recordId.

Actions: `followupChecksListAction`, `followupCheckGetAction`, `followupCheckSourceAction`, `followupCheckSaveAction`, `followupCheckSourcesAction` (existing result list). Each verifies feature gate and current auth user. Page query accepts exact caseId/resultId/recordId only. Invalid array/UUID/mismatched filters404; missing migration isolated notice. Existing parent `/checks?recordId=...` checks owned follow-up first and redirects exact caseId/recordId to `/checks/next`, rejecting conflicting simulation/round/case parameters. This preserves result page's existing return links for follow-up plans. Only this legacy redirect tolerates expected missing141 before falling back to legacy get; unrelated errors propagate.

Workspace adds followup_check DTO label `根据调查继续确认的计划`, own plan summary/deadline/method only, live sourceAvailable from result ownership/existence; fixed path `/business-lab/simulation/checks/next?caseId=...&recordId=...`. Keep all140 unions/global C-collated keyset/cursor behavior.

## Verification and release

TDD core/domain/transport, actual137/139/141 current-plan creation/edit/erase, source loss/other owner/legacy DTO/receipt replay/tombstone/race guards,139 follow-up versions+results and atomic erasure; mixed133–142 keysets including followup_check with no duplicate reality_check; no ideas/validations/activity changes. UI source-first empty state, no copied next plan text, exact routes/filter, source failure privacy, edits clear preview, retries/conflicts/pagination/deletion. Independent review; full Vitest/TS/lint; actual React fixture desktop/mobile/console; production141→142 then code, catalog/advisors and owner/null/anon reads only. No artificial production rows/provider calls. Append141/142 verbatim to schema.sql, preserve concurrent main, follow Production-specific Vercel success, verify logged-in screen, save screenshot and stop fixture.
