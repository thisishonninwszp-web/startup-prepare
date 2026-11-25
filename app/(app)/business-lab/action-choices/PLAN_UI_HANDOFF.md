# Task 2: plan editor UI

Ready for independent specification, quality and browser review. No commits, production operations, provider calls, domain/SQL/schema changes, or results/history edits were made by this agent.

## Public contracts

- `actions.ts` exports `loadActionChoiceIdeasAction(input: {before?: string} = {})`. It resolves owner from the existing feature gate and authenticated user, then calls the domain transport. Only the transport's explicit `available: false` response represents missing migration151; unexpected errors remain visible.
- `ActionChoiceFields` is controlled with `value`, `onChange`, `conditionsMode: 'explicit' | 'expectations'`, optional `currentExpectations`, `disabled`, and optional `ideas` (the return value of `useActionChoiceIdeas`). Default `null` renders only the optional enable control. The export `blankActionChoice(mode)` starts all own text empty and all mapping selects unchosen. Empty mapping sentinels exist only in the editor and are rejected by `actionChoiceInputSchema` before preview/save.
- Field names: `decision`, `currentAction`, `alternativeAction`, `holdAction`, `conditionA`/`conditionB` (explicit mode only), `mapping-a`, `mapping-b`, `mapping-unclear`, `relatedIdeaId`.
- Enable/disable controls: `填写行动约定（可选）` / `本版不使用行动约定`. Other new controls: `更多本人想法`, `重新读取本人想法`.
- `useActionChoiceEditor` shares independent choice state, preview projection, capability handling, install/reset/invalidation, and whole-command extension preparation. `useActionChoiceIdeas` supplies generation-guarded focus refresh, paginated owned ideas, and fresh exact linked-plan metadata. Post-save metadata installation accepts a generation token so a read started before focus cannot restore its cached linked title.

## Integrated behavior

All three existing editors include the optional block in dirty navigation, reset/reopen, preview and save workflows. Explanation conditions reuse the same edited draft's expectedA/B and have no duplicate condition inputs. Any plan/expectation or choice change retracts the preview. Same A/B mapping is a nonblocking hint limited to the two known outcomes.

Available capability always sends an object or explicit null. Confirmed missing151 with no current or previously saved choice omits the field to preserve the legacy save workflow (root-approved compatibility clarification). A current choice, a prior saved choice even after opt-out, or unexpected capability failure cannot silently downgrade to a legacy request. Inputs remain available for repair/retry.

Confirmation immediately blocks editing while capability verification completes, then pins the complete request into the existing pending/retry mechanism. Focus does not change that request's ID/body. New/reset clears the optional block; saved record reopen reads `actionChoice.choice`. Source/focus refresh preserves independent dirty input. Explanation server-prop revision changes now expose a comparison instead of silently rebasing edits onto a newer revision.

Only owned idea context/plan DTO metadata supplies labels. Off-page existing links stay selected; deleted/unavailable links retain the ID with generic unavailable wording; an owned empty title uses the generic untitled label and remains available. Focus clears cached titles immediately and stale page replies cannot repopulate them. The shared root `ActionChoiceSummary` supplies preview/read-only rendering.

## Validation

Observed assertion RED then GREEN for shared fields/auth, all three action save/invalidation/retry workflows, preflight edit locks, explanation server-prop conflict, and the no-silent-null guard. Metadata regressions cover off-page/untitled/deleted links, failed focus refresh, unexpected errors, missing151, and stale cursor replies.

Latest checks (2026-11-26, Asia/Tokyo):

- Targeted Vitest: **14 files / 119 tests passed** (shared action UI, explanations, simulation plan workflow/panel, followup plan workflows/panel).
- `npx tsc --noEmit --pretty false`: exit0, no output.
- Scoped ESLint over all17 touched TypeScript/TSX files: exit0, no output.
- No Next build was run, per root's running browser fixture constraint. Root owns browser acceptance, aggregate verification and release.

The existing workflow tests use lightweight React hook/tree harnesses. Browser acceptance is still needed to verify actual focus dispatch, controls and mobile layout.

## Independent review follow-up

The spec reviewer reproduced stale linked-title restoration on overlapping simulation focus reads and cached conflict adoption. Added deterministic assertion RED then GREEN coverage for the overlapping response order, cached adoption in all three editors, and exact unavailable metadata taking precedence over the older candidate page (including draft reset).

Every fresh plan read that certifies metadata now passes its captured context generation. Simulation focus also advances the plan-read epoch so older replies cannot replace source state. Cached install/edit/adopt changes independent text only and cannot certify metadata. Per-ID exact metadata overrides candidate titles/availability for the current context generation and survives reset/switch; starting a fresh context refresh clears both the candidate page and those overrides before accepting its new response. A known unavailable candidate cannot reappear from resetting the draft.

Follow-up targeted verification: **14 files / 124 tests passed**. TypeScript and scoped ESLint were rerun after these changes. Root owns the independent re-review and final release checks.

## Clean simulation-plan erasure follow-up

Quality review found simulation's exact-null reads kept clean cached plan/choice prose. A narrow `forgetErased` path now clears an unchanged active plan after exact-null focus verification, reopening that active ID, post-acknowledgement reconciliation, or pending comparison. Actual dirty local edits remain visible with a conflict; read exceptions and unrelated missing requested IDs preserve current input. The original pending command stays pinned when reconciliation cannot confirm it.

Erased-ID tombstones filter later list replies and reject cached/delayed DTO installs, including explicit erasure. Added clean-with-choice regressions for the four exact-null paths plus dirty/error/unrelated-ID behavior and stale list filtering. Initial clean focus/open/ack assertions were observed RED before the fix.

Latest narrow checks: **2 files / 35 tests passed**, full TypeScript exit0, scoped two-file ESLint exit0 with no warnings. Only simulation panel/workflow test changed for this follow-up; no build or release actions were performed by this agent.
