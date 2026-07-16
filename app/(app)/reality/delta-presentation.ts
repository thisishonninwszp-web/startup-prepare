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
