# Internal Business Plan Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, versioned “我的公司” workspace that parses all visible sheets in a local `.xlsx`, removes supplier identities before upload, preserves detailed financial tables, and gives source-cited AI answers without retaining the original workbook or AI payloads.

**Architecture:** The browser parses and redacts the workbook, then uploads gzipped normalized JSON chunks directly to a private Supabase bucket. Server Actions verify ownership and coordinate one AI extraction call per chunk, immutable snapshot aggregation, version comparison, and retrieval-based Q&A. Internal company data remains separate from external `companies` records and enters reality maps only through an explicit snapshot link.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Tailwind, ExcelJS, JSZip, Supabase PostgreSQL/Storage/Auth, Gemini via `lib/ai.ts`, Vitest

---

## Phase 1: Security and persistence foundation

### Task 1: Add dependencies and database/storage schema

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/migrations/022_internal_business_plan.sql`
- Modify: `scripts/check-schema.mjs`
- Test: `app/business-plan-schema-contract.test.ts`

- [ ] **Step 1: Install browser-only workbook dependencies**

Run:

```powershell
npm.cmd install exceljs jszip
```

Expected: `exceljs` and `jszip` appear in dependencies and the lockfile changes.

- [ ] **Step 2: Write the failing schema contract test**

Create `app/business-plan-schema-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/022_internal_business_plan.sql",
  "utf8"
);

describe("internal business plan migration", () => {
  it("creates isolated owner-scoped tables and a private bucket", () => {
    for (const table of [
      "own_company_profiles",
      "business_plan_imports",
      "business_plan_chunks",
      "business_plan_supplier_aliases",
      "business_plan_extractions",
      "business_plan_snapshots",
      "business_plan_questions",
    ]) {
      expect(sql).toContain(`create table if not exists ${table}`);
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toContain("'internal-business-plans'");
    expect(sql).toContain("public = false");
    expect(sql).toContain("business_plan_snapshot_id");
  });
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```powershell
npm.cmd test -- app/business-plan-schema-contract.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 4: Create migration `022_internal_business_plan.sql`**

Implement the seven tables and constraints from the approved design. Use these invariants:

```sql
create table if not exists own_company_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_plan_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references own_company_profiles(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  status text not null check (
    status in ('uploading','extracting','awaiting_confirmation','completed','failed')
  ),
  file_name text not null,
  file_size integer not null check (file_size between 1 and 10485760),
  workbook_hash text not null,
  visible_sheet_count integer not null check (visible_sheet_count > 0),
  chunk_count integer not null check (chunk_count > 0),
  previous_import_id uuid references business_plan_imports(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (profile_id, version_no),
  unique (user_id, workbook_hash)
);

create table if not exists business_plan_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references business_plan_imports(id) on delete cascade,
  sheet_name text not null,
  cell_range text not null,
  ordinal integer not null check (ordinal >= 0),
  storage_path text not null unique,
  content_hash text not null,
  row_count integer not null check (row_count > 0),
  column_count integer not null check (column_count > 0),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','completed','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  unique (import_id, ordinal)
);

create table if not exists business_plan_supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name_hmac text not null,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name_hmac),
  unique (user_id, alias)
);

create table if not exists business_plan_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references business_plan_imports(id) on delete cascade,
  chunk_id uuid not null unique references business_plan_chunks(id) on delete cascade,
  facts jsonb not null default '[]',
  plans jsonb not null default '[]',
  forecasts jsonb not null default '[]',
  cost_items jsonb not null default '[]',
  assumptions jsonb not null default '[]',
  risks jsonb not null default '[]',
  unknowns jsonb not null default '[]',
  source_refs jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists business_plan_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null unique references business_plan_imports(id) on delete cascade,
  summary jsonb not null,
  strategy jsonb not null,
  financial_outlook jsonb not null,
  cost_structure jsonb not null,
  selling_general_admin jsonb not null,
  assumptions jsonb not null,
  risks jsonb not null,
  unknowns jsonb not null,
  source_refs jsonb not null,
  delta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists business_plan_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null references business_plan_imports(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  answer jsonb not null,
  source_refs jsonb not null,
  created_at timestamptz not null default now()
);
```

For every table, enable RLS and create an owner policy using `auth.uid() = user_id`. Insert/update `storage.buckets` with:

```sql
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'internal-business-plans',
  'internal-business-plans',
  false,
  2097152,
  array['application/json', 'application/gzip']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Create owner-prefixed `storage.objects` select/delete policies. Add nullable `business_plan_snapshot_id` to `reality_case_sources`, add its foreign key, and replace `reality_case_sources_parent_check` so `num_nonnulls(...) <= 1` includes the new column.

- [ ] **Step 5: Extend schema verification**

Add all seven tables and `reality_case_sources.business_plan_snapshot_id` to `scripts/check-schema.mjs`. The script must report a missing table/column without printing any row content.

- [ ] **Step 6: Run schema contract test**

Run:

```powershell
npm.cmd test -- app/business-plan-schema-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json supabase/migrations/022_internal_business_plan.sql scripts/check-schema.mjs app/business-plan-schema-contract.test.ts
git commit -m "feat: add internal business plan storage schema"
```

### Task 2: Add metadata-only AI diagnostics

**Files:**
- Modify: `lib/ai-gateway.ts`
- Modify: `lib/ai-gateway.test.ts`

- [ ] **Step 1: Write failing gateway tests**

Add:

```ts
it("marks sensitive calls as metadata-only", () => {
  expect(shouldStoreAiPayload("metadata_only")).toBe(false);
});

it("keeps encrypted diagnostics as the default", () => {
  expect(shouldStoreAiPayload(undefined)).toBe(true);
  expect(shouldStoreAiPayload("encrypted")).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- lib/ai-gateway.test.ts
```

Expected: FAIL because `shouldStoreAiPayload` and the context option do not exist.

- [ ] **Step 3: Implement the diagnostic mode**

Extend:

```ts
export type AiCallContext = {
  // existing fields
  payloadLogging?: "encrypted" | "metadata_only";
};
```

Add `business_plans` to `AiModule`. Add a pure exported helper:

```ts
export function shouldStoreAiPayload(
  mode: AiCallContext["payloadLogging"]
): boolean {
  return mode !== "metadata_only";
}
```

Use the helper in both `safeCreateAiCall` and `safeCreateAiAttempt`: call `maybeEncrypt` only when it returns true; otherwise write a null payload and set the metadata-only flag. Pass the logging mode into `safeCreateAiAttempt`; validation errors must contain only error codes for metadata-only calls, never parser messages containing table content.

- [ ] **Step 4: Verify GREEN**

```powershell
npm.cmd test -- lib/ai-gateway.test.ts app/ai-gateway-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/ai-gateway.ts lib/ai-gateway.test.ts
git commit -m "feat: add metadata-only AI diagnostics"
```

---

## Phase 2: Local workbook parsing, redaction, and private upload

### Task 3: Build the browser-safe workbook domain

**Files:**
- Create: `app/companies/my/types.ts`
- Create: `app/companies/my/excel-domain.ts`
- Create: `app/companies/my/excel-domain.test.ts`
- Create: `app/companies/my/excel-worker.ts`

- [ ] **Step 1: Write failing domain tests**

Cover these behaviors with in-memory normalized cells:

```ts
it("keeps visible sheets and excludes hidden sheets", () => {
  expect(selectVisibleSheets([
    { name: "PL", state: "visible" },
    { name: "内部メモ", state: "hidden" },
  ])).toEqual([{ name: "PL", state: "visible" }]);
});

it("replaces confirmed suppliers before chunking", () => {
  expect(
    redactCells(
      [{ address: "B4", value: "株式会社山田商事 仕入" }],
      new Map([["株式会社山田商事", "供应商A"]])
    )[0].value
  ).toBe("供应商A 仕入");
});

it("chunks by contiguous range and repeats headers", () => {
  const chunks = chunkSheet(makeRows(501), 500);
  expect(chunks).toHaveLength(2);
  expect(chunks[1].rows[0]).toEqual(chunks[0].rows[0]);
});
```

Also test rejection of `.xlsm`, external-link ZIP entries, encrypted/non-ZIP input, more than 10 MB, no visible sheets, formulas without cached results, and unconfirmed sensitive candidates.

- [ ] **Step 2: Verify RED**

```powershell
npm.cmd test -- app/companies/my/excel-domain.test.ts
```

- [ ] **Step 3: Implement pure domain functions**

Export:

```ts
export function validateWorkbookFile(file: Pick<File, "name" | "size">): void;
export function inspectZipEntries(names: string[]): void;
export function selectVisibleSheets<T extends { state: string }>(sheets: T[]): T[];
export function detectSensitiveCandidates(cells: NormalizedCell[]): SensitiveCandidate[];
export function redactCells(
  cells: NormalizedCell[],
  aliases: Map<string, string>
): NormalizedCell[];
export function chunkSheet(sheet: NormalizedSheet, maxRows?: number): WorkbookChunk[];
export async function sha256Hex(value: ArrayBuffer | string): Promise<string>;
```

`NormalizedCell` must preserve address, row, column, type, display value, optional formula, and cached result. `WorkbookChunk` must contain sheet name, range, headers, rows, units, ordinal, and content hash. Never include hidden sheet data in returned objects.

- [ ] **Step 4: Implement the worker**

`excel-worker.ts` must:

1. Load the `ArrayBuffer` with JSZip and reject `xl/vbaProject.bin` or any `xl/externalLinks/` entry.
2. Load with ExcelJS.
3. Read only worksheets whose state is `visible`.
4. Normalize cells and return candidate locations without transmitting the file to the server.
5. Return structured error codes, not workbook content.

- [ ] **Step 5: Verify GREEN**

```powershell
npm.cmd test -- app/companies/my/excel-domain.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add app/companies/my/types.ts app/companies/my/excel-domain.ts app/companies/my/excel-domain.test.ts app/companies/my/excel-worker.ts
git commit -m "feat: parse and redact business plan workbooks locally"
```

### Task 4: Add owner profile, import actions, and upload UI

**Files:**
- Create: `app/companies/my/queries.ts`
- Create: `app/companies/my/actions.ts`
- Create: `app/companies/my/page.tsx`
- Create: `app/companies/my/import/page.tsx`
- Create: `app/companies/my/import/import-workspace.tsx`
- Modify: `app/companies/page.tsx`
- Modify: `.env.local.example`
- Modify: `DEPLOY.md`
- Test: `app/companies/my/import-contract.test.ts`

- [ ] **Step 1: Write failing ownership and upload contract tests**

The contract test must assert:

- Import creation checks the authenticated user.
- Supplier plaintext is passed only to the HMAC function and never inserted.
- Storage paths start with `${userId}/${importId}/`.
- Only confirmed redacted chunks receive signed upload tokens.
- Duplicate workbook hashes return the existing import instead of creating a new version.

- [ ] **Step 2: Implement Server Actions**

Create:

```ts
export async function ensureOwnCompanyProfile(displayName: string): Promise<string>;
export async function resolveSupplierAliases(names: string[]): Promise<Record<string, string>>;
export async function createBusinessPlanImport(input: CreateImportInput): Promise<{
  importId: string;
  versionNo: number;
  uploads: Array<{ chunkId: string; path: string; token: string }>;
}>;
export async function markBusinessPlanUploadComplete(
  importId: string,
  uploadedChunkIds: string[]
): Promise<void>;
export async function deleteBusinessPlanImport(importId: string): Promise<void>;
```

Use `createHmac("sha256", BUSINESS_PLAN_HMAC_KEY)` and reject a missing/short key. Never log supplier names. `createBusinessPlanImport` validates every manifest field and creates signed upload tokens with `supabaseAdmin.storage.from("internal-business-plans").createSignedUploadUrl(path)`.

- [ ] **Step 3: Document the HMAC secret**

Add this required variable without a real secret:

```dotenv
BUSINESS_PLAN_HMAC_KEY=
```

Document that it must be a base64-encoded 32-byte random value. Rotating it breaks cross-version supplier alias matching but does not make stored redacted data unreadable.

- [ ] **Step 4: Implement upload workspace**

The client flow is:

1. Select one `.xlsx`.
2. Parse in the worker and show all visible sheets.
3. Show supplier/PII candidates and require confirmation.
4. Resolve stable aliases.
5. Redact, chunk, gzip with `CompressionStream("gzip")`.
6. Create import and upload each chunk using `uploadToSignedUrl`.
7. Mark upload complete and show per-chunk progress/retry.

Do not keep the original `ArrayBuffer` after normalization; clear the file input and worker state.

- [ ] **Step 5: Add “我的公司” entry**

Pin a visually separated card at the top of `/companies` linking to `/companies/my`. Do not add internal profile records to `listCompanies` or JobOutreach.

- [ ] **Step 6: Verify**

```powershell
npm.cmd test -- app/companies/my/import-contract.test.ts app/companies/my/excel-domain.test.ts
npm.cmd run lint
npm.cmd run build
```

- [ ] **Step 7: Commit**

```powershell
git add app/companies/my app/companies/page.tsx .env.local.example DEPLOY.md
git commit -m "feat: upload redacted internal business plans"
```

---

## Phase 3: AI extraction and immutable plan versions

### Task 5: Add structured AI contracts and incremental processing

**Files:**
- Create: `app/companies/my/ai-types.ts`
- Create: `app/companies/my/ai-types.test.ts`
- Modify: `lib/ai.ts`
- Modify: `app/companies/my/actions.ts`
- Modify: `app/companies/my/queries.ts`
- Create: `app/companies/my/plans/[version]/page.tsx`
- Create: `app/companies/my/plans/[version]/plan-version-view.tsx`

- [ ] **Step 1: Write failing parser tests**

Test that chunk extraction and snapshot parsers:

- Require every item to have `kind`, `text`, `sheet_name`, and `cell_range`.
- Allow only `fact / plan / forecast / cost / assumption / risk / unknown`.
- Reject invented source ranges not present in the allowed chunk range.
- Preserve exact numeric strings and units.
- Reject scores, percentages used as confidence, or success probabilities.

- [ ] **Step 2: Implement AI types and citation validation**

Define:

```ts
export type BusinessPlanSourceRef = {
  sheet_name: string;
  cell_range: string;
};

export type BusinessPlanEvidenceItem = {
  kind: "fact" | "plan" | "forecast" | "cost" | "assumption" | "risk" | "unknown";
  text: string;
  value: string | null;
  unit: string | null;
  source: BusinessPlanSourceRef;
};
```

Add runtime parsers and `validateBusinessPlanRefs(output, allowedRefs)`.

- [ ] **Step 3: Add AI functions**

In `lib/ai.ts`, add:

```ts
export async function extractBusinessPlanChunk(input: BusinessPlanChunkAiInput);
export async function buildBusinessPlanSnapshot(input: BusinessPlanExtraction[]);
export async function compareBusinessPlanVersions(previous: BusinessPlanSnapshot, current: BusinessPlanSnapshot);
```

Every call uses:

```ts
{
  module: "business_plans",
  operation: "...",
  entityType: "business_plan_import",
  entityId: input.importId,
  outputMode: "json",
  payloadLogging: "metadata_only",
}
```

Use `responseJsonSchema`, one repair attempt, and citation validation. Treat cell text as untrusted data and explicitly ignore embedded instructions.

- [ ] **Step 4: Implement incremental processing actions**

Add:

```ts
export async function processBusinessPlanChunk(
  importId: string,
  chunkId: string
): Promise<void>;

export async function finalizeBusinessPlanSnapshot(
  importId: string
): Promise<{ versionNo: number }>;
```

`processBusinessPlanChunk` transitions one chunk from pending/failed to processing, downloads and gunzips only that owned chunk, calls AI once, writes one extraction, then marks completed. On failure, preserve the chunk and set a non-sensitive error code.

`finalizeBusinessPlanSnapshot` refuses to run unless every chunk is completed. It creates the immutable snapshot, compares with the previous completed import, and updates import status in one RPC/transaction.

- [ ] **Step 5: Implement resumable progress and version page**

The import page lists pending/failed chunks and invokes one processing action at a time. Closing and reopening the page resumes from database state. The version page displays summary, strategy, financial outlook, cost structure, 販管費, assumptions, risks, unknowns, and source refs. Adjacent-version changes use semantic colors without scores.

- [ ] **Step 6: Verify**

```powershell
npm.cmd test -- app/companies/my/ai-types.test.ts app/companies/my/import-contract.test.ts
npm.cmd run lint
npm.cmd run build
```

- [ ] **Step 7: Commit**

```powershell
git add app/companies/my lib/ai.ts
git commit -m "feat: extract versioned business plan snapshots"
```

---

## Phase 4: Detailed Q&A and reality-map linking

### Task 6: Add retrieval-based, source-cited questions

**Files:**
- Modify: `app/companies/my/ai-types.ts`
- Modify: `app/companies/my/ai-types.test.ts`
- Modify: `lib/ai.ts`
- Modify: `app/companies/my/actions.ts`
- Create: `app/companies/my/ask/page.tsx`
- Create: `app/companies/my/ask/ask-workspace.tsx`

- [ ] **Step 1: Write failing answer contract tests**

Require:

```ts
{
  answer: string;
  explicit_content: string[];
  ai_inferences: string[];
  unknowns: string[];
  source_refs: BusinessPlanSourceRef[];
}
```

Reject source refs not included in retrieved chunks and reject fields such as `score`, `probability`, `success_rate`, or unsupported recommendations.

- [ ] **Step 2: Implement deterministic retrieval**

Retrieve candidate chunks using:

1. Exact sheet-name and source-range matches.
2. Question keywords against extraction text and snapshot sections.
3. Matching categories such as 販管費, 原価, 売上, cash flow, strategy.

Limit context by character count and include only the smallest set of chunks that covers the matched sources. If no chunk matches, answer from the snapshot and explicitly state the detailed table was not selected.

- [ ] **Step 3: Add `answerWithBusinessPlan`**

Use metadata-only diagnostics and require source citations from the retrieved allowlist. The prompt must distinguish workbook content, plans/forecasts, AI inference, and unknowns.

- [ ] **Step 4: Implement Q&A UI**

The user selects a completed version, asks up to 2000 characters, and sees source chips such as `販管費!B2:M48`. A source chip expands the redacted rows used for the answer. No original supplier name can be reconstructed.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- app/companies/my/ai-types.test.ts
npm.cmd run lint
npm.cmd run build
git add app/companies/my lib/ai.ts
git commit -m "feat: ask source-cited business plan questions"
```

### Task 7: Add explicit reality-source integration

**Files:**
- Modify: `app/reality/types.ts`
- Modify: `app/reality/types.test.ts`
- Modify: `app/reality/queries.ts`
- Modify: `app/reality/actions.ts`
- Modify: `app/reality/new/reality-form.tsx`
- Test: `app/reality/business-plan-source.test.ts`

- [ ] **Step 1: Write failing source-boundary tests**

Test that:

- Only completed snapshots owned by the current user appear as options.
- A forged/cross-user snapshot ID is rejected.
- Snapshot facts, plans, forecasts, and AI inferences remain separate.
- A source snapshot is immutable after a newer business-plan version appears.

- [ ] **Step 2: Extend reality source types**

Add `"business_plan"` to `REALITY_SOURCE_TYPES`. Update `sourceColumn` to return `business_plan_snapshot_id` for this type instead of relying on string concatenation.

- [ ] **Step 3: Add source option and snapshot creation**

`listRealitySourceOptions` adds completed business-plan snapshots with version number and completion date. `snapshotSource` verifies ownership and creates:

```ts
{
  type: "business_plan",
  label: "经营计划 · v3",
  content: JSON.stringify({
    explicit_facts: snapshot.summary.facts,
    plans: snapshot.strategy,
    forecasts: snapshot.financial_outlook,
    unknowns: snapshot.unknowns,
    source_refs: snapshot.source_refs,
  }),
}
```

Update reality AI rules so only `explicit_facts` may become fact candidates; plans, forecasts, and inferences stay interpretations/unknowns until reality evidence confirms them.

- [ ] **Step 4: Add explicit UI selection**

Show business plan snapshots in the existing manual source selector under a separate “内部经营计划” group. Do not preselect the latest snapshot.

- [ ] **Step 5: Full verification**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all tests pass, no ESLint warnings/errors, production build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add app/reality
git commit -m "feat: link business plan snapshots to reality maps"
```

---

## Deployment checkpoints

1. Apply migration `022_internal_business_plan.sql`.
2. Configure `BUSINESS_PLAN_HMAC_KEY` with a base64-encoded 32-byte random key.
3. Confirm the Gemini API key belongs to a billing-enabled Cloud project.
4. Deploy Phase 1 and verify metadata-only diagnostics before exposing import UI.
5. Deploy Phases 2–3 together as the first user-facing release.
6. Verify a real 3 MB workbook: visible sheets only, no raw workbook network request, stable supplier aliases, resumable extraction, and exact source ranges.
7. Deploy Phase 4 after snapshot accuracy is accepted.

Generate the new secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
