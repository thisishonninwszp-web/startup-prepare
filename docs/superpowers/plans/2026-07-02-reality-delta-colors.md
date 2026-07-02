# Reality Delta Semantic Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each kind of change in an updated reality map visually distinct without implying a score, ranking, or positive/negative judgment.

**Architecture:** Add a small pure presentation module that owns the five semantic color mappings and the neutral empty state. `DeltaBlock` will consume that mapping while continuing to render the existing `RealityDelta` data, so no AI, database, or schema changes are required.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Vitest

---

### Task 1: Add and apply semantic delta presentation

**Files:**
- Create: `app/reality/delta-presentation.ts`
- Create: `app/reality/delta-presentation.test.ts`
- Modify: `app/reality/[id]/reality-map.tsx:409-449`

- [ ] **Step 1: Write the failing presentation test**

Create `app/reality/delta-presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  REALITY_DELTA_PRESENTATION,
  getRealityDeltaClasses,
} from "./delta-presentation";

describe("reality delta presentation", () => {
  it("assigns a distinct semantic color to every change type", () => {
    expect(REALITY_DELTA_PRESENTATION.added_facts.accent).toBe("emerald");
    expect(REALITY_DELTA_PRESENTATION.revised_interpretations.accent).toBe("amber");
    expect(REALITY_DELTA_PRESENTATION.resolved_unknowns.accent).toBe("sky");
    expect(REALITY_DELTA_PRESENTATION.new_unknowns.accent).toBe("rose");
    expect(REALITY_DELTA_PRESENTATION.emotion_changes.accent).toBe("violet");
  });

  it("uses neutral classes when a group has no changes", () => {
    expect(getRealityDeltaClasses("new_unknowns", false)).toEqual({
      card: "border-border bg-muted/30",
      label: "text-muted-foreground",
      badge: "bg-muted text-muted-foreground",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm.cmd test -- app/reality/delta-presentation.test.ts
```

Expected: FAIL because `delta-presentation.ts` does not exist.

- [ ] **Step 3: Implement the presentation mapping**

Create `app/reality/delta-presentation.ts` with:

```ts
export const REALITY_DELTA_PRESENTATION = {
  added_facts: {
    title: "新增事实",
    accent: "emerald",
    card: "border-emerald-200 bg-emerald-50/70",
    label: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-800",
  },
  revised_interpretations: {
    title: "修正解释",
    accent: "amber",
    card: "border-amber-200 bg-amber-50/70",
    label: "text-amber-800",
    badge: "bg-amber-100 text-amber-800",
  },
  resolved_unknowns: {
    title: "解决的未知",
    accent: "sky",
    card: "border-sky-200 bg-sky-50/70",
    label: "text-sky-800",
    badge: "bg-sky-100 text-sky-800",
  },
  new_unknowns: {
    title: "新增未知",
    accent: "rose",
    card: "border-rose-200 bg-rose-50/70",
    label: "text-rose-800",
    badge: "bg-rose-100 text-rose-800",
  },
  emotion_changes: {
    title: "情绪变化",
    accent: "violet",
    card: "border-violet-200 bg-violet-50/70",
    label: "text-violet-800",
    badge: "bg-violet-100 text-violet-800",
  },
} as const;

export type RealityDeltaPresentationKey =
  keyof typeof REALITY_DELTA_PRESENTATION;

const NEUTRAL_CLASSES = {
  card: "border-border bg-muted/30",
  label: "text-muted-foreground",
  badge: "bg-muted text-muted-foreground",
} as const;

export function getRealityDeltaClasses(
  key: RealityDeltaPresentationKey,
  hasChanges: boolean
) {
  if (!hasChanges) return NEUTRAL_CLASSES;
  const item = REALITY_DELTA_PRESENTATION[key];
  return { card: item.card, label: item.label, badge: item.badge };
}
```

- [ ] **Step 4: Run the presentation test and verify GREEN**

Run:

```bash
npm.cmd test -- app/reality/delta-presentation.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Apply the mapping to `DeltaBlock`**

Import the presentation helpers into `app/reality/[id]/reality-map.tsx`. Replace tuple groups with keyed objects, then render each group as a bordered card:

```tsx
const groups = [
  { key: "added_facts", items: delta.added_facts },
  { key: "revised_interpretations", items: delta.revised_interpretations },
  { key: "resolved_unknowns", items: delta.resolved_unknowns },
  { key: "new_unknowns", items: delta.new_unknowns },
  { key: "emotion_changes", items: delta.emotion_changes },
] as const;
```

For each group, call `getRealityDeltaClasses(key, items.length > 0)` and render:

```tsx
<div className={`rounded-md border p-3 ${classes.card}`}>
  <div className="flex items-center justify-between gap-3">
    <div className={`text-xs font-medium ${classes.label}`}>{title}</div>
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${classes.badge}`}>
      {items.length}
    </span>
  </div>
  <div className="mt-2">
    {items.length > 0 ? (
      <TextList items={items} />
    ) : (
      <span className="text-xs text-muted-foreground">没有明确变化</span>
    )}
  </div>
</div>
```

Keep `grid gap-3 md:grid-cols-2` so mobile remains one column and desktop remains two columns.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all Vitest tests pass, ESLint reports no warnings/errors, and the Next.js production build completes.

- [ ] **Step 7: Commit only the feature files**

```bash
git add app/reality/delta-presentation.ts app/reality/delta-presentation.test.ts app/reality/[id]/reality-map.tsx docs/superpowers/plans/2026-07-02-reality-delta-colors.md
git commit -m "feat: highlight reality version changes"
```
