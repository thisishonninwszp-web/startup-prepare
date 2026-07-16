import {
  allowedClosureBasisRefs,
  type RealityClosureSourceSnapshot,
} from "@/app/(app)/reality/closure-source";
import type { DecisionClosureSourceSnapshot } from "./domain";

const REF_LABELS: Record<string, string> = {
  "reality:topic": "现状课题",
  "reality:emotions": "情绪与判断影响",
  "reality:facts": "已确认事实",
  "reality:interpretations": "用户解释与假设",
  "reality:unknowns": "未知与信息缺口",
  "reality:constraints": "约束与可影响变量",
  "reality:contradictions": "矛盾与盲区",
  "reality:selected_path": "已选择的初步方向",
};

function labelForRef(ref: string): string {
  if (REF_LABELS[ref]) return REF_LABELS[ref];
  if (ref.startsWith("bayesian:")) return "贝叶斯信念";
  if (ref.startsWith("fermi:")) return "费米估算";
  if (ref.startsWith("reframing:")) return "认知重构";
  if (ref.startsWith("focus:")) return "聚焦探索";
  return ref;
}

export function buildRealityDecisionClosureSource(
  source: RealityClosureSourceSnapshot
): DecisionClosureSourceSnapshot {
  return {
    refs: allowedClosureBasisRefs(source).map((ref) => ({
      ref,
      label: labelForRef(ref),
    })),
    reality: source.reality,
    reasoning: source.reasoning,
    focused_inquiries: source.focused_inquiries,
  };
}
