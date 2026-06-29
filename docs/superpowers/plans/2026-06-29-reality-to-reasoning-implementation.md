# Reality-to-Reasoning Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create an editable Bayesian, Fermi, or reframing draft directly from the currently displayed immutable reality version while preserving a server-generated source snapshot.

**Architecture:** Add one polymorphic `reasoning_sources` table with exactly one reasoning target per row. New reasoning pages load and verify a reality version, client forms request an AI draft without creating data, and existing creation actions persist both the reasoning record and an immutable source snapshot. Source loading, validation, display, and AI draft parsing live in focused shared modules.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase/PostgreSQL, Google Gemini through `lib/ai.ts`, Tailwind CSS, Vitest.

---

## File Map

- Create `supabase/migrations/012_reality_reasoning_bridge.sql`: source table, constraints, indexes, RLS.
- Create `app/reasoning/reality-source.ts`: source types, ownership query, snapshot creation, persistence, cleanup helpers.
- Create `app/reasoning/reality-source.test.ts`: snapshot, ownership, and target-column invariants.
- Create `app/reasoning/reality-source-card.tsx`: compact source summary reused by new/detail pages.
- Modify `app/reasoning/types.ts`: AI draft types and parser.
- Modify `lib/ai.ts`: `draftReasoningFromReality`.
- Modify `app/reasoning/actions.ts`: draft action and source-aware creation.
- Modify `app/reasoning/validation.ts`: optional `reality_version_id` normalization.
- Modify `app/reasoning/security.test.ts`: cross-user source rejection.
- Modify the three `reasoning/*/new/page.tsx` and form files: load source, generate prefill, preserve edits.
- Modify the three reasoning detail pages/workspaces: display saved source.
- Modify `app/reality/[id]/reality-map.tsx`, `reality-workspace.tsx`, and version page: pass version ID into bridge links.
- Modify `scripts/check-schema.mjs`: require the new bridge table as core schema.

### Task 1: Database Source Model

**Files:**
- Create: `supabase/migrations/012_reality_reasoning_bridge.sql`
- Modify: `scripts/check-schema.mjs`
- Test: `app/schema-contract-config.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Add assertions that migration 012 defines the source table and exclusive target constraint:

```ts
const migration = readFileSync(
  "supabase/migrations/012_reality_reasoning_bridge.sql",
  "utf8"
);
expect(migration).toContain("create table if not exists reasoning_sources");
expect(migration).toContain(
  "num_nonnulls(bayesian_belief_id, fermi_estimate_id, reframing_session_id) = 1"
);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd test -- app/schema-contract-config.test.ts
```

Expected: FAIL because migration 012 does not exist.

- [ ] **Step 3: Add the migration**

Create:

```sql
create table if not exists reasoning_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reality_version_id uuid not null references reality_versions(id) on delete cascade,
  bayesian_belief_id uuid references bayesian_beliefs(id) on delete cascade,
  fermi_estimate_id uuid references fermi_estimates(id) on delete cascade,
  reframing_session_id uuid references reframing_sessions(id) on delete cascade,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint reasoning_sources_one_target check (
    num_nonnulls(
      bayesian_belief_id,
      fermi_estimate_id,
      reframing_session_id
    ) = 1
  )
);

create unique index if not exists reasoning_sources_bayesian_uniq
  on reasoning_sources(bayesian_belief_id)
  where bayesian_belief_id is not null;
create unique index if not exists reasoning_sources_fermi_uniq
  on reasoning_sources(fermi_estimate_id)
  where fermi_estimate_id is not null;
create unique index if not exists reasoning_sources_reframing_uniq
  on reasoning_sources(reframing_session_id)
  where reframing_session_id is not null;
create index if not exists reasoning_sources_reality_version_idx
  on reasoning_sources(reality_version_id);

alter table reasoning_sources enable row level security;
```

Add `["reasoning_sources", "id,user_id,reality_version_id,source_snapshot"]` to the core probes in `scripts/check-schema.mjs`.

- [ ] **Step 4: Run the migration contract test**

Run:

```powershell
npm.cmd test -- app/schema-contract-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/012_reality_reasoning_bridge.sql scripts/check-schema.mjs app/schema-contract-config.test.ts
git commit -m "feat: add reasoning source schema"
```

### Task 2: Source Domain and Ownership

**Files:**
- Create: `app/reasoning/reality-source.ts`
- Create: `app/reasoning/reality-source.test.ts`

- [ ] **Step 1: Write failing domain tests**

Test the target mapping and immutable snapshot shape:

```ts
expect(reasoningTargetColumn("bayesian")).toBe("bayesian_belief_id");
expect(reasoningTargetColumn("fermi")).toBe("fermi_estimate_id");
expect(reasoningTargetColumn("reframing")).toBe("reframing_session_id");

const snapshot = buildRealityReasoningSnapshot({
  realityCase: { id: "case-1", title: "增长停滞", context: "business" },
  version: {
    id: "version-1",
    version_no: 2,
    created_at: "2026-06-29T00:00:00.000Z",
    map,
    selected_path: selectedPath,
    custom_action: null,
    selection_reason: "先确认事实",
  },
});
expect(snapshot.version.id).toBe("version-1");
expect(snapshot.map).toEqual(map);
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement focused source helpers**

Define:

```ts
export type ReasoningTool = "bayesian" | "fermi" | "reframing";

export type RealityReasoningSnapshot = {
  realityCase: {
    id: string;
    title: string;
    context: RealityContext;
  };
  version: {
    id: string;
    version_no: number;
    created_at: string;
  };
  map: RealityMap;
  selected_path: RealityPath | null;
  custom_action: string | null;
  selection_reason: string | null;
};

export function reasoningTargetColumn(tool: ReasoningTool) {
  return {
    bayesian: "bayesian_belief_id",
    fermi: "fermi_estimate_id",
    reframing: "reframing_session_id",
  }[tool];
}
```

Implement `loadOwnedRealityReasoningSnapshot(versionId, userId)` using:

```ts
supabaseAdmin
  .from("reality_versions")
  .select(
    "id, version_no, map, selected_path, custom_action, selection_reason, created_at, reality_cases!inner(id, user_id, title, context)"
  )
  .eq("id", versionId)
  .eq("reality_cases.user_id", userId)
  .maybeSingle();
```

Parse the map with `parseRealityMap`, validate the nested relation, and return `null` for a missing/cross-user version without exposing data.

Implement:

```ts
saveReasoningSource({
  userId,
  tool,
  targetId,
  snapshot,
})
```

The insert must set only the target column returned by `reasoningTargetColumn`.

- [ ] **Step 4: Run the source tests**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/reasoning/reality-source.ts app/reasoning/reality-source.test.ts
git commit -m "feat: add reality reasoning source domain"
```

### Task 3: Evidence-Bounded AI Draft

**Files:**
- Modify: `app/reasoning/types.ts`
- Modify: `lib/ai.ts`
- Test: `app/reasoning/reality-source.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add:

```ts
expect(
  parseReasoningRealityDraft({
    tool: "bayesian",
    question: "当前增长停滞主要由获客渠道失效造成吗？",
    used_sections: ["facts", "unknowns"],
  })
).toEqual({
  tool: "bayesian",
  question: "当前增长停滞主要由获客渠道失效造成吗？",
  used_sections: ["facts", "unknowns"],
});

expect(() =>
  parseReasoningRealityDraft({
    tool: "bayesian",
    question: "成功率是80%",
    used_sections: ["facts"],
  })
).toThrow();
```

- [ ] **Step 2: Run parser tests and verify RED**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts
```

Expected: FAIL because parser is missing.

- [ ] **Step 3: Add discriminated draft types and parser**

Add:

```ts
export type ReasoningRealityDraft =
  | { tool: "bayesian"; question: string; used_sections: string[] }
  | {
      tool: "fermi";
      question: string;
      category: "market" | "time" | "cost" | "custom";
      used_sections: string[];
    }
  | {
      tool: "reframing";
      topic_text: string;
      context_note: string;
      used_sections: string[];
    };
```

Reject score, probability, success-rate, and invented-fact fields. Require the output tool to match the requested tool.

- [ ] **Step 4: Add the AI function**

In `lib/ai.ts`, implement:

```ts
export async function draftReasoningFromReality(
  tool: ReasoningTool,
  snapshot: RealityReasoningSnapshot
): Promise<ReasoningRealityDraft> {
  return generateRealityJson(
    REALITY_REASONING_DRAFT_PROMPT,
    JSON.stringify({ tool, snapshot }),
    (value) => {
      const parsed = parseReasoningRealityDraft(value);
      if (parsed.tool !== tool) throw new Error("reasoning tool mismatch");
      return parsed;
    }
  );
}
```

The prompt must state:

- Facts, interpretations, and unknowns are separate.
- Use only snapshot content.
- Do not generate prior probability, success rate, score, evidence, or plan.
- Output one editable draft, not multiple ranked candidates.

- [ ] **Step 5: Run the parser and AI JSON tests**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts lib/ai-json.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/reasoning/types.ts app/reasoning/reality-source.test.ts lib/ai.ts
git commit -m "feat: draft reasoning inputs from reality"
```

### Task 4: Source-Aware Creation Actions

**Files:**
- Modify: `app/reasoning/validation.ts`
- Modify: `app/reasoning/actions.ts`
- Modify: `app/reasoning/security.test.ts`

- [ ] **Step 1: Write failing validation and ownership tests**

Add `reality_version_id` normalization assertions to all three inputs:

```ts
expect(
  normalizeCreateBayesianBelief({
    question: "判断",
    reality_version_id: "version-1",
  }).reality_version_id
).toBe("version-1");
```

Mock a cross-user version and verify the draft and create actions reject it before calling AI or inserting a reasoning record.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm.cmd test -- app/reasoning/security.test.ts
```

Expected: FAIL because the source parameter is ignored.

- [ ] **Step 3: Add the draft Server Action**

Implement:

```ts
export async function prepareReasoningFromReality(
  tool: ReasoningTool,
  realityVersionId: string
) {
  const userId = await requireUserId();
  const snapshot = await loadOwnedRealityReasoningSnapshot(
    realityVersionId,
    userId
  );
  if (!snapshot) throw new Error("现状版本不存在或无权访问");
  return draftReasoningFromReality(tool, snapshot);
}
```

- [ ] **Step 4: Persist verified sources in all create actions**

For each normalized input:

1. Load the source snapshot when `reality_version_id` exists.
2. Reject missing/cross-user versions.
3. Create the reasoning record through the existing flow.
4. Call `saveReasoningSource`.
5. If source persistence fails, delete the just-created parent record; child rows cascade.

The browser must submit only `reality_version_id`; never accept `source_snapshot`.

- [ ] **Step 5: Run security tests**

```powershell
npm.cmd test -- app/reasoning/security.test.ts app/reasoning/database-error-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/reasoning/validation.ts app/reasoning/actions.ts app/reasoning/security.test.ts
git commit -m "feat: create reasoning records with reality sources"
```

### Task 5: Prefill Forms and Bridge Links

**Files:**
- Create: `app/reasoning/reality-source-card.tsx`
- Modify: `app/reality/[id]/reality-map.tsx`
- Modify: `app/reality/[id]/reality-workspace.tsx`
- Modify: `app/reality/[id]/versions/[version]/page.tsx`
- Modify: all three `app/reasoning/*/new/page.tsx`
- Modify: all three form components

- [ ] **Step 1: Write a bridge-link test**

Create a focused rendering/domain test verifying:

```ts
expect(reasoningBridgeHref("bayesian", "version-1")).toBe(
  "/reasoning/bayesian/new?reality_version_id=version-1"
);
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm.cmd test -- app/reality/types.test.ts
```

Expected: FAIL because the helper is absent.

- [ ] **Step 3: Pass the displayed version ID into the bridge**

Add `versionId?: string` to `RealityMapView`. Render the “继续深化” section only when a selected path and version ID exist. Build links with `URLSearchParams` so version IDs are encoded.

The workspace passes the latest generated version ID; the immutable version page passes its loaded version ID.

- [ ] **Step 4: Load the source summary in new pages**

Each page accepts:

```ts
searchParams: Promise<{
  idea_id?: string;
  reality_version_id?: string;
}>;
```

When a source ID exists, authenticate, call `loadOwnedRealityReasoningSnapshot`, and render an unavailable message for an invalid source. Pass the verified snapshot summary and version ID into the form.

- [ ] **Step 5: Add the shared source card**

Render:

```tsx
<section className="rounded-lg border bg-muted/30 p-4">
  <p className="text-xs text-muted-foreground">来自现状认识</p>
  <p className="mt-1 text-sm font-medium">
    {snapshot.realityCase.title} · v{snapshot.version.version_no}
  </p>
  {snapshot.selected_path && (
    <p className="mt-2 text-xs">
      当前路径：{snapshot.selected_path.title}
    </p>
  )}
</section>
```

- [ ] **Step 6: Add client-side automatic draft generation**

Each form:

- keeps controlled field state;
- calls `prepareReasoningFromReality` once on mount when a verified source exists;
- fills only fields that the user has not edited;
- displays retry on failure;
- includes `<input type="hidden" name="reality_version_id" ...>`;
- never submits automatically.

For Bayesian, do not fill `prior`. For Fermi, set the returned category. For reframing, fill both text fields.

- [ ] **Step 7: Run focused tests**

```powershell
npm.cmd test -- app/reality/types.test.ts app/reasoning/security.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add app/reality app/reasoning
git commit -m "feat: prefill reasoning tools from reality maps"
```

### Task 6: Source Display on Reasoning Details

**Files:**
- Modify: `app/reasoning/reality-source.ts`
- Modify: all three reasoning detail pages
- Modify: all three reasoning workspace components
- Test: `app/reasoning/reality-source.test.ts`

- [ ] **Step 1: Write a failing saved-source parser test**

Verify malformed or cross-tool snapshots are rejected and a valid source yields:

```ts
{
  realityCaseId: "case-1",
  realityVersionId: "version-1",
  versionNo: 2,
  title: "增长停滞",
  selectedPathTitle: "补充信息"
}
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts
```

Expected: FAIL because saved-source loading is absent.

- [ ] **Step 3: Implement target-specific source loading**

Implement:

```ts
getReasoningSource(
  tool: ReasoningTool,
  targetId: string,
  userId: string
)
```

Query `reasoning_sources` by `user_id` and the exact target column. Parse `source_snapshot`; do not fall back to the current reality version contents.

- [ ] **Step 4: Render the source card in details**

Each detail page loads its reasoning record and source in `Promise.all`, then passes the source to the workspace. The card links to:

```text
/reality/{caseId}/versions/{versionNo}
```

Only render the link when the source belongs to the current user; otherwise show the stored title and version without a link.

- [ ] **Step 5: Run focused tests**

```powershell
npm.cmd test -- app/reasoning/reality-source.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/reasoning
git commit -m "feat: show reality provenance on reasoning records"
```

### Task 7: Full Verification and Deployment Handoff

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run the complete test suite**

```powershell
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint and production build**

```powershell
npm.cmd run lint
npm.cmd run build
```

Expected: exit code 0 for both.

- [ ] **Step 3: Verify migration locally without mutating production**

Before applying migration 012, `npm.cmd run db:check` is expected to fail only on `reasoning_sources`. Apply `012_reality_reasoning_bridge.sql` to the intended Supabase project, then rerun:

```powershell
npm.cmd run db:check
```

Expected: core schema contract passes including `reasoning_sources`; the separate optional concept warning may remain until migration 010 is installed.

- [ ] **Step 4: Check the final diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files staged; `.claude/` remains untouched.

- [ ] **Step 5: Commit any verification-only correction**

If verification required changes, stage exactly the files reported by
`git status --short` that belong to this feature and commit:

```powershell
git commit -m "fix: verify reality reasoning bridge"
```

If verification required no changes, skip this commit.

- [ ] **Step 6: Push**

```powershell
git push origin main
```

Expected: `main` advances and Vercel deployment starts.
