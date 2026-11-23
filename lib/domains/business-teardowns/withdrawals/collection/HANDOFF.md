# Withdrawal collection Task5

Implemented only the separately consented collection scope. No production/provider calls, environment changes, enabled account settings, commits, or146/147/148/150/core withdrawal edits were made. New collection remains OFF unless `BUSINESS_WITHDRAWAL_COLLECTION_ENABLED` is exactly `true` **and** the configured main owner explicitly enables the separate account policy. Existing Rakuten consent is never reused.

## Entry points and contracts

- `/business-lab/withdrawals/collection`: main-owner-only settings and safe diagnostic metadata. It identifies the separate extra Tokyo-day budget, selected registered HTTPS issuers, public text sent to Gemini, no private notes, and required manual candidate confirmation. The enable control cannot be checked while the deployment switch is off. Settings retries keep the same complete body/requestId until acknowledged.
- `transport.ts`: `loadCollectionState(owner)`, `saveCollectionSettings(owner,input)`, `collectionCommand(owner,operation,input)`, `assertCollectionOwner(owner)`, `withdrawalCollectionEnabled()`. Every call verifies `businessJobOwner`; output DTOs and operation-specific receipt identities/revisions are strict. Only missing149 state becomes `available:false`.
- Settings input: `{enabled,issuerIds,publicTextConfirmed,policyVersion:'official-withdrawal-public-text-v1',expectedRevision,requestId}`. No configurable numeric budget. SQL checks that every selected registry row is owned and explicitly confirmed.
- `executeWithdrawalCollection(owner,deps?)`: DI command/search/page/AI/owner/environment/clock. A single owner/day claim is terminal after success/failure/uncertainty; existing running claims return no token, expired leases become unknown. No provider retry/fallback. All new saved candidates use deterministic run+identity UUIDs and `confirmed:false`.
- `/api/cron/business-withdrawals`: existing `CRON_SECRET`; configured main owner only. Confirmed queue `select_today` remains independent and uses zero external requests. Disabled/new-schema-unavailable collection returns an explicit200 result. Unknown/failed collection returns502, infrastructure errors503. Existing legacy business routes were not changed.
- `.github/workflows/signals-jobs.yml`: independent `always() && !cancelled()` withdrawal step, same secret and invocation cache discriminator; no retries or Vercel cron added.

## Durable149 API

Service-only public RPC `business_withdrawal_collection_command(p_user_id,p_operation,p_input)` has state/settings/claim/check/ticket/settle/archive/save_candidate/complete/terminate operations. All five collection tables have RLS and no direct role grants; private helper EXECUTE is revoked including service_role. Operations serialize under existing owner lock719; idempotency receipts bind the operation and exact JSON body.

Private tables: `business_withdrawal_collection_settings`, `_runs`, `_tickets`, `_archives`, `_receipts`. Each owner+Tokyo-day has one run, a token, frozen settings revision and issuer IDs, ten-minute lease. Every ticket reserves the immutable cap **before** I/O:2 searches,3 actual page HTTP requests including redirects,1 AI call. Failures consume their reservation. Termination marks reserved tickets unknown. Checks reject revoked/revised settings or expired leases.

`save_candidate` checks the live lease/current consent, complete official source validation and matching completed page+AI tickets, then invokes the existing146 `business_withdrawal_command` atomically under the same lock. Receipts are `{status:'saved',id,revision:1}` or `{status:'duplicate',identityKey}`. A duplicate, including an erased canonical identity, is skipped while later new valid candidates continue; other errors remain terminal. No broad PostgreSQL exception is swallowed.

The bounded Tavily adapter sends one POST with `redirect:'error'`, timeout and no fallback, and retains URL hints only. Unlike the general search helper it cannot follow unreserved redirects. `fetchPublicPage` gained optional third argument `{beforeRequest?:(url)=>Promise<void>}`; existing callers stay compatible. The hook runs after public URL/DNS checks and before actual fetch on every hop, outside the fetch catch. Collection requires exact registered HTTPS host on every hop and reserves each request separately.

At most three frozen public pages enter one `executeAiText` call via `lib/ai/business-withdrawals.ts` and the `lib/ai` facade; configured `MODEL`, metadata-only logs, gateway provider attempts1. AI never chooses officialness or identity. Code recovers exact spelling only for normalized registry identity components found in the page. Factual/source binding failures discard that candidate; invalid analysis fields are removed independently while valid facts survive. All candidates require manual semantic confirmation. Original rejected output, issue codes, validator version and truncation are privately archived; ordinary UI/state never returns or renders rejected prose.

## Verification

- RED→GREEN scoped Vitest:30 tests/12 files passed (separate consent, strict transport/owner gates, DI caps/stop/unknown/no AI retry, snippets excluded, exact identity/partial analysis, duplicate then valid draft, per-hop private/foreign/quota guards, bounded search adapter, owner-only actions, SSR text/defaults, cron/workflow).
- Actual PGlite119–146 +149 +147/148/150 composition passed: two owners, strict consent/selected registry, replay/conflict, token/revision and stop, six immutable cap reservations, matching completed source/AI tickets, new unconfirmed drafts, duplicate then valid candidate, atomic archive+receipt rollback, expiry/reserved-ticket unknown, RLS/private table and helper ACL, no unrelated writes.
- Full `npx tsc --noEmit --pretty false` and scoped ESLint with `--max-warnings=0` passed.
- Independent read-only review reran the30 tests and actual149 SQL; duplicate finding corrected and closed.
- SQL command: `node lib/domains/business-teardowns/withdrawals/collection/postgres.integration.mjs <absolute @electric-sql/pglite/dist/index.js>`.

PGlite uses one connection, so it exercises serialized commands/replay and SQL locking paths but cannot demonstrate contention between genuinely concurrent PostgreSQL sessions. Root owns browser/full-suite/schema/release verification and activation remains OFF.

## Physical erasure correction

Frozen run issuer IDs joined to the owned registry identity form the durable private run-to-subject relation. This includes an existing lesson reached through an alternate registered host and covers erasure during I/O before `save_candidate`.149 triggers on both canonical source and lesson erasure clear the **whole matching owner-run archive `raw`**, conserving issue codes, validator version, timestamps and truncation metadata. Other owners and unrelated subject runs remain untouched. A new archive operation checks all frozen subject identities against lesson/source tombstones and writes empty raw for an affected batch; replayed archive/save receipts cannot restore prose. The duplicate path also immediately scrubs an affected current run.

`erasure.integration.mjs` first reproduced the retained raw prose on old149 (RED), then passed with the correction: ordinary accepted multi-candidate batch, before/after-save archives, metadata/owner/unrelated-run scope, late archive and receipt replay, alternate-registry duplicate, already-erased tombstone before association, erasure during I/O, and canonical-source-only erasure. Run it with the same PGlite absolute module argument as the main integration script. No production/provider calls were used.
