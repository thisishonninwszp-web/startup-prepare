# ケースの続きを再開する（提案①）

User approved all three proposals with「お願いします」after recommendation①→③→②. Existing isolated worktree is reused on codex/operator-continuity. This spec is approved scope clarification, not a new first-level module.

- Case detail shows a single owner-scoped continuation section combining saved pressure answers, cash assumptions, making practice, confirmed methods and counterexample studies. A small home entry links to the most recently updated readable case with authored work. It does not call a provider, write activity, infer capability or assign completion scores.
- Store no new copies of source/report prose. Read public case names live; summaries are bounded excerpts of independent authored fields. Method prose must pass existing live source/baseline validity rules; invalid source prose stays hidden. Distinguish a saved plan from an actual artifact and a method proposal from explicit adoption.
- Cards show kind, authored title/excerpt, saved time and an explicit open action. Show next-check text only if the user actually authored it. Use record identity in deep links so a link opens that exact saved record, not an empty form or the first list page. Unknown/missing/other-owner ids show a clear unavailable notice and never open another record.
- New read-only RPC business_workspace_read(p_user_id,p_operation,p_input) supports case({caseId,before?}) and recent({before?}); strict bounded keyset pagination20, owner/service guard, live source visibility. Use per-domain immutable IDs/kind as cursor tie-breakers and updated_at where present. No new writable tables.
- Existing tool pages accept recordId and mount their actual saved record without automatically adopting a later revision. Existing conflict/retry/source guards must remain intact.
- Missing133 migration makes only continuation unavailable; other tools remain usable. Boundary/simulation cards are integrated by root after their independent implementations; no forward SQL dependency on134/135.
- UI stays Chinese Field Notes, shared Button/PageContainer, no first-level navigation.

Files: lib/domains/business-teardowns/workspace/**; app/(app)/business-lab/workspace/**; deep-link changes in the four existing pressure/cash/practice/counterexamples tool pages/panels;133_business_case_workspace.sql. Root owns case/home entry integration and schema.sql.
