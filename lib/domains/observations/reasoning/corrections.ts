import type { CorrectionImpact } from "./domain";
export function unacknowledgedImpacts(impacts: CorrectionImpact[], subjectId?: string): CorrectionImpact[] {
  return impacts.filter(impact => !impact.acknowledged && (!subjectId || impact.subject_id === subjectId));
}
