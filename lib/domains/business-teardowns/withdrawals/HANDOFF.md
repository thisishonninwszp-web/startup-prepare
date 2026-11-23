# Withdrawal foundation handoff

Implemented Task1 only. No provider calls, production data, app files, schema.sql, or commits were touched. Collection remains unimplemented and disabled.

## TypeScript API

`domain.ts` exports `WithdrawalLesson`, `WithdrawalLessonInput`, `WithdrawalIssuer`, `WithdrawalCommand`, `WithdrawalPage<T>`, `withdrawalIdentityKey(subject)` and strict Zod schemas. All limits use UTF16 length. `transport.ts` exports:

```ts
withdrawalCommand(owner: string, command: WithdrawalCommand)
// save/register/erase => {id:string,revision:number}
// select_today => {id:string|null,caseId:string|null,revision:number|null}
withdrawalRead(owner, 'issuers', {before?:string}) // WithdrawalPage<WithdrawalIssuer>
withdrawalRead(owner, 'list', {before?:string})    // WithdrawalPage<WithdrawalLesson>
withdrawalRead(owner, 'get', {id:string})          // WithdrawalLesson|null
withdrawalRead(owner, 'today', {})                // WithdrawalLesson|null
```

The transport encodes date/UUID cursors as base64url; SQL cursors are `{date,id}`. It rejects unknown DTO fields, foreign get IDs, wrong receipt IDs/revisions, malformed/unordered pages and cursor mismatches. Only missing-migration errors become `{available:false,items:[],nextCursor:null}` on paged reads.

Lesson DTO is the approved contract plus:

- `confirmed:boolean`: owner explicitly confirmed disclosure semantics; false means draft, never selected automatically.
- `selectedOn:string|null`: daily publication date in Tokyo, separate from the source publication and event dates. Null iff not selected (`caseId` null).
- `bindings:{subject,phase,announcedOn,effectiveOn,publishedOn}`: contiguous exact source quotations. Subject quote includes the literal subject name, operator and market. Each date needs its own quote supporting ISO, Japanese year/month/day or slash date; unknown dates and their bindings are both null. `eventQuote` binds the event; `reasonQuote` is null if unavailable. Quote matching cannot prove semantics: manual confirmation remains mandatory.

`offering` and `buyers` must be null in this first version; unsupported factual summaries are rejected. Explanations A/B and distinguishing observation are optional hypotheses, never verified causal claims.

Commands:

```ts
{operation:'register_issuer',id,requestId,
 issuer:{name,domain,subjectIdentityKey},confirmed:true}
{operation:'save',id,requestId,expectedRevision,
 lesson:WithdrawalLessonInput,confirmed:boolean}
{operation:'erase',id,requestId,expectedRevision}
{operation:'select_today',requestId}
```

Build subject identity via `withdrawalIdentityKey({operator,market,scope,name})` before registration and lesson entry. The normalized key uses NFKC, lowercase and collapsed whitespace, joined by `|`; component fields cannot contain `|`. Scope is company/business/store/product. Register the exact lowercase DNS host, without protocol/path/port. Issuers associate an owner-confirmed domain with one exact subject key, not an AI suggestion. URLs must use that exact host over HTTPS; credentials, ports, IP literals, whitespace, backslashes and encoded control bytes are rejected.

Save first at revision0 with a client-created UUID. Factual/source anchors freeze at first save; subsequent revisions can change explanations/unknowns and confirmation only, before selection. A selected lesson is immutable except erasure. Sources are never silently overwritten. Empty queue selection is receipted as null; reuse that requestId only for the same operation. A new explicit selection after the queue changes uses a new requestId.

## SQL146 integration

`business_daily_cases.case_kind` is shop(default)/withdrawal. Shop rows require a merchant and no lesson. Withdrawal rows require an owned lesson and null merchant/report. Daily uniqueness is `(user_id,local_date,case_kind)`; a lesson is selected once. Shared identity remains the real case UUID throughout research/checks/results/methods.

Private helpers (all EXECUTE revoked, including service_role):

```sql
business_subject_context(owner uuid, case_id uuid)
-- {caseId,caseTitle,kind:'shop'|'withdrawal'} or null for missing/erased source
business_withdrawal_explanation_source(owner uuid, lesson uuid, revision integer)
-- {caseId,title,explanationA,explanationB,distinguishingObservation,
--  refs:[{quote,url}],anchor:{kind:'withdrawal',lessonId,lessonRevision}}
-- Requires selected owned confirmed live lesson, exact current revision and both explanations.
```

`business_simulation_context` remains unchanged and excludes withdrawals through its merchant join. Root's147/148 should use `business_subject_context` for generalized label-only projections; do not broaden simulation eligibility.

Private tables (RLS enabled; no table grants):

- `business_withdrawal_issuers`: id/user_id/name/domain/subject_identity_key/created_at/confirmed_at.
- `business_withdrawal_lessons`: id/user_id/identity_key/subject_scope/event/phase/announced_on/effective_on/payload/confirmed/revision/created_at/erased_at. Payload contains the input except source. Unique owner+identity includes tombstones.
- `business_withdrawal_sources`: **id equals lessonId**; user_id/issuer_id/source_url/captured_text/captured_at/published_on/content_hash/erased_at. This is the canonical official text for148 research SourceKind. Erasure changes text to empty and erased_at atomically; ordinary source updates/deletion are forbidden. Add148 erasure invalidation trigger here.
- `business_withdrawal_receipts`: owner/request/input_hash/result, no source or analysis text.

Only service_role can invoke public `business_withdrawal_command/read`. Both use existing `business_service(owner)`; app actions must resolve the owner from login. Commands use tagged SHA256 receipts before rereading mutable sources, plus the established owner lock719. Selection takes earliest confirmed, live, unselected identity in the existing queue, at most one per Tokyo day, with no provider dependency.

Erasure clears the complete lesson payload and official source text. Metadata, identity, dates, hashes, case IDs and receipts remain for deduplication/tombstones. Live DTOs resolve source text from the canonical table. An erased DTO contains empty subject display fields/quotes and null analysis; user-authored research/plan/result text is outside this store and is preserved unless its own existing erasure policy requires clearing derived source content.

Legacy function definitions are copied in full and replaced in146, with explicit shop-only selectors:119 prepare/load/save-material and121's `business_job_command_v121` used by123's wrapper. No runtime definition rewriting occurs. Source attachment rejects withdrawal case IDs. Identity immutability uses null-safe comparisons. Existing `queries.ts` shop history/detail reads filter `case_kind='shop'`.

## Verification

- Scoped domain/transport/shop-query Vitest:17 tests passed.
- Actual SQL `postgres.integration.mjs` loads119–146 with actual dependencies: two owners/private ACL, quotes/dates/UTF16/strict keys, drafts/confirmation, normalized identity dedup, same-day shop+withdrawal, legacy shop reserve/job claim, source immutability, explanation helper, >20 tied pages, replay/tombstone/erase rollback, physical erase, no unrelated writes; passed.
- `legacy-jobs.integration.mjs` executes the original job PostgreSQL regression suite after135+146; passed.
- Scoped ESLint passed. Full TypeScript invocation found only root's concurrently edited history explanation label-map errors after the one local test narrowing error was fixed.

PGlite invocation: `node lib/domains/business-teardowns/withdrawals/postgres.integration.mjs <absolute @electric-sql/pglite/dist/index.js>`.
