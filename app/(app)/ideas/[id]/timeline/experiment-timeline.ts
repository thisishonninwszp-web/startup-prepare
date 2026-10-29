import type { TimelineEvent } from "./queries";
export type ExperimentTimelineRun = { id: string; experiment_id: string; status: string; started_at: string; finished_at: string | null };
export function experimentTimelineEvents(runs: ExperimentTimelineRun[]): TimelineEvent[] {
  return runs.flatMap(run => {
    const events: TimelineEvent[] = [{ at: run.started_at, kind: "experiment_run", title: "前提 / 原型核对：冻结样本并开始运行", detail: `实验 ${run.experiment_id.slice(0, 8)} · 运行 ${run.id.slice(0, 8)}；不是一次真实接触。`, isRealContact: false }];
    if (run.finished_at) events.push({ at: run.finished_at, kind: "experiment_run", title: `前提 / 原型核对：${run.status === "completed" ? "运行完成" : run.status === "cancelled" ? "取消本次运行" : "运行未完成"}`, detail: `运行 ${run.id.slice(0, 8)}；痛点和付费仍未知。查看实验卡中的逐案结果与范围说明。`, isRealContact: false });
    return events;
  });
}
