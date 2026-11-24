# Research action choices core

Task1 implementation is ready for app integration and independent review. No git, production, provider, schema.sql, app, or old migration changes were made by this agent.

## Public contracts

`domain.ts` exports the exact approved `ActionTarget`, `ActionConditions`, `ActionChoiceInput`, `ActionChoiceView`, `ActionReview`, `ActionChoiceIdeas` types; `actionChoiceInputSchema`, `actionChoiceViewSchema`, `actionReviewSchema`; and `sameActionForKnownOutcomes`, `expectedAction`. Additional shared exports are `actionTargetSchema`, `actionCommandWithinLimit`, and `actionChoiceMatchesExpectations` (strict projection consistency).

`transport.ts` exports `loadActionChoiceIdeas(owner, {before?} = {})`. Its public shape is exactly `{available, items: [{id,title}], nextCursor}`. The private RPC response additionally carries each item's `createdAt` so transport can verify microsecond date/id ordering; transport strips it. Only missing `business_action_choice_context` errors (42883/PGRST202 naming this RPC) become unavailable. Other database failures throw. Production nullable idea titles become an empty string for UI labeling; link availability is based on finding the owned row, so untitled ideas remain available.

All three save schemas accept optional `actionChoice: Input | null`; erase schemas reject it. Explanation requires `conditions.kind: expectations`; simulation/followup require explicit conditions. Raw whole JSON UTF8 is checked before trimming at 160000 bytes; explanation's original 80000-byte command limit remains on input excluding the new field. Other original body/field limits remain.

Result append accepts optional `actionReview` object; erase rejects it. Server SQL supplies Tokyo execution-date validation. Result review omission stays omitted. No review is inferred from material or AI.

Optional `.actionChoice` was added to all three plan records, ResultPlan/Version/Record, and ConfirmationNode. Optional `.actionReview` was added to result records/nodes. Absent extras remain absent, not null. Exact A/B projection consistency is checked on explanation, result version/record and history boundaries. Result plan summary has no additional expectation requirement, preserving its old strict DTO shape.

## Migration151

`151_business_research_action_choices.sql` copies the latest existing 137/139/141/147 command definitions with bounded extensions; existing workflow-specific hash formats, lock137, source filters and receipt-first replay remain intact. It also extends existing DTO helpers/history nodes and adds only service-role `business_action_choice_context(...,'ideas',...)`.

The two new tables are private, RLS enabled, and ungranted to every API role including service_role. New helpers have no EXECUTE grants to API roles. Choices FK the exact owned version; result reviews FK the owned result independently of plans. Plan deletion cascades all version choices and clears result choice projections while retaining reviews. Result deletion cascades reviews. Sources and ideas never supply copied titles to storage. New/changed idea links require live owned ideas; unchanged dead links allow independent updates. Receipts retain hashes only and full extended requests bind object/null/omission distinctly.

## Verification

Observed meaningful assertion RED before implementation for domain constraints, four command/history cases, ideas transport, exact DTO expectations, and original raw UTF8 budgets. The SQL RED run without151 rejected the first extended save at the real strict137 command.

Latest checks (2026-11-24):

- Targeted Vitest: 15 files, 68 tests passed.
- `npx tsc --noEmit --pretty false`: exit0, no output.
- Scoped ESLint over all new/changed TypeScript: exit0, no output.
- Actual151 SQL: PASS. Loads withdrawal fixture bootstrap's real119–146 plus147/148/149/150, generates pre151 receipts for all three origins/results, installs151, then checks exact versions/null/omission, strict fields/UTF16/raw UTF8, owner/version/idea isolation, live title/source loss, child-insert and receipt-trigger rollback, independent review erasure, hash-only receipts/replays/tombstones, tied20 idea pages and ACL/no validation/activity writes.
- Legacy SQL compatibility: four unchanged assertion suites (139 results,141 followup,143 history,147 explanations) pass against all real119–151 migrations. The wrapper adapts the old139 fixture's current-only backfill boundary and its minimal ideas insert column list; assertions are unchanged.

Commands:

```powershell
npx vitest run lib/domains/business-teardowns/action-choices lib/domains/business-teardowns/reality-checks lib/domains/business-teardowns/followup-checks lib/domains/business-teardowns/explanations lib/domains/business-teardowns/reality-results lib/domains/business-teardowns/history
npx tsc --noEmit --pretty false
$pglite = 'C:/Users/pc/.codex/visualizations/2026/10/25/01a17228-5263-75d0-96db-ac39e7f31278/event-db-test/node_modules/@electric-sql/pglite/dist/index.js'
node lib/domains/business-teardowns/action-choices/postgres.integration.mjs $pglite
node lib/domains/business-teardowns/action-choices/legacy-postgres.integration.mjs $pglite
```

Root still owns app integration, schema.sql append, aggregate verification, git and production decisions. No public shape deviations from the approved contracts.
