# 確認履歴

User approved both proposed improvements ("全部やる"): linked confirmation history and reusable conditional methods. This spec covers the independent read-only history; result methods have a separate spec. Continue implementation/release without new scope gates.

## Behavior

`/business-lab/history` optionally scoped by owned caseId displays own plan versions and real-result records together, with exact parent pointers. Each saved plan version shows its four original own fields; result shows independent checkedOn/examined/found/sourceNote/sourceUrl/learned plus its actual frozen plan snapshot/saved time if still present. Reuse date timing note; checkedOn is stated by user, at/server timestamps do not prove investigation order. "考えを変えた理由" is only the user's learned text; never infer another reason, causal relationship, supported/refuted grade, completed status or unresolved status from absence in one page.

Plan parent is original simulation(id/source_revision) or origin_result_id(revision1); result parent is planId/exact planRevision. Live available flag checks owned exact reference. Missing/erased parents display metadata-only unavailability, never copied source text. Every parent can be opened through an exact fixed path even past the first page; plan parent opens this history at exact nodeId/nodeRevision, result parent opens exact result record. Simulation link goes to exact existing simulation route. Result cards offer exact next-plan and conditional-method creation links. New first-level navigation is prohibited; root adds case workspace/operator entry and saved-record context links.

## Shared contract

New `lib/domains/business-teardowns/history/`:
```ts
type ConfirmationParent={kind:'simulation'|'result'|'plan';id:string;revision:number;available:boolean};
type ConfirmationNode={kind:'plan'|'result';id:string;caseId:string;revision:number;at:string;parent:ConfirmationParent;
 plan:RealityCheckPlan|null;body:RealityResultBody|null;planSnapshot:RealityCheckPlan|null;planSavedAt:string|null;snapshotErasedAt:string|null};
type ConfirmationHistory={available:boolean;items:ConfirmationNode[];nextCursor:string|null};
type ConfirmationNodeKey={kind:'plan';id:string;revision:number}|{kind:'result';id:string};
```
Plan node id is parent plan UUID and revision is actual saved version. at=version.saved_at. plan nonnull, body/planSnapshot/planSavedAt/snapshotErasedAt null. Result revision1, at=created_at, plan null, body nonnull, frozen snapshot/time/erasedAt exactly139 record. Plan origin result revision1, simulation source_revision>=2. Result parent kind plan exact plan_revision. Result parent available iff owned exact version exists; plan-parent availability follows owned source existence. Strict identity and nullable-state validation in TS and SQL projection.

Exports `confirmationUuid`, types, `listConfirmationHistory(owner,{caseId?,before?}={})` and `getConfirmationNode(owner,key)`. list20 keyset at/kind(C)/id/revision DESC, base64url strict canonical cursor{at,kind,id,revision}. Validate strict DTO/order/uniqueness/cursor/id/filter including microseconds. Only list isolates missing143 availablefalse. get returns null for exact missing/other-owner; no reconstructing pre139 old versions. Missing143 message isolated; history is complete only over retained versions, not imagined historical events.

143 `business_confirmation_history_read(p_user_id,p_operation,p_input)` service-only operations list/get, private `business_confirmation_history_nodes(p_owner,p_case)` projection helper. No tables or write API; no idea/validation/activity/career/lock writes. Underlying139 version/result tables remain private. All fixed safe search_path and helpers revoked from all client roles including service; only RPC service execute.

## Page/UI

History agent owns `app/(app)/business-lab/history/**` page/actions/panel/view/tests. Exports `ConfirmationHistoryPanel` props `{initialState:ConfirmationHistory,initialNode?:ConfirmationNode|null,caseId?:string}`. Actions `confirmationHistoryListAction`, `confirmationHistoryGetAction`; each gate/auth. Strict supported page queries caseId/nodeKind/nodeId/nodeRevision only. Exact-node params must form complete valid key; result forbids nodeRevision, plan requires positive int32. Exact selected node must match case filter and may be beyond page1; absent selected node404, no fallback to first item.

Read-only panel renders chronological rows and separate exact selected node when not on current page. Keys include kind/id/revision. Explicit load more20, exact open, refresh. Focus hides all cached prose immediately before fresh authenticated reads; failure leaves metadata/notice and manual reload, not cached erased source text. Epoch/in-flight safety, exact successful null removes cached node and prevents stale responses reinstalling it; no global empty/completed claims on paginated partial data. Parent exact version data is live, never reconstructed from a later current plan. New-result and method links are fixed paths. No AI, fetching URLs, scores or writes.

## Acceptance

TDD domain/transport/query/auth/UI, two owners, tied keyset across multiple plan revisions/results, exact node beyond page1, only-current139 backfill, immutable old condition after edits, plan erase deletes all versions/clears result snapshot but preserves independent result, result erase leaves followup own plan with missing parent. Actual119/120/135/137/139/141/143 SQL and no unrelated writes; verify ACL/source DTO states. Browser actual component source delete/focus failure, exact old-parent traversal, mobile/console. Production143 before app; read-only production probes and logged-in UI, no synthetic production records.
