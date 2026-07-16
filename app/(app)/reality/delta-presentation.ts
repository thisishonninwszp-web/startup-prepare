export const REALITY_DELTA_PRESENTATION = {
  added_facts: {
    title: "新增事实",
    accent: "emerald",
    card: "border-status-mvp/30 bg-status-mvp/10/70",
    label: "text-status-mvp",
    badge: "bg-status-mvp/15 text-status-mvp",
  },
  revised_interpretations: {
    title: "修正解释",
    accent: "amber",
    card: "border-status-validating/30 bg-status-validating/10/70",
    label: "text-status-validating",
    badge: "bg-status-validating/15 text-status-validating",
  },
  resolved_unknowns: {
    title: "解决的未知",
    accent: "sky",
    card: "border-status-hypothesis/30 bg-status-hypothesis/10/70",
    label: "text-status-hypothesis",
    badge: "bg-status-hypothesis/15 text-status-hypothesis",
  },
  new_unknowns: {
    title: "新增未知",
    accent: "rose",
    card: "border-destructive/30 bg-destructive/10/70",
    label: "text-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
  emotion_changes: {
    title: "情绪变化",
    accent: "violet",
    card: "border-verdict-learned/30 bg-verdict-learned/10/70",
    label: "text-verdict-learned",
    badge: "bg-verdict-learned/15 text-verdict-learned",
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
