import { supabaseAdmin } from "@/lib/supabase";
import { uuid } from "../domain";
import { parseSearchImport } from "./imports";

export type SearchOutreachDraft = { runId: string; ideaId: string; title: string; scenario: string };
export async function loadSearchOutreachDraft(userId: string, runId: string): Promise<SearchOutreachDraft> {
  uuid.parse(userId); uuid.parse(runId);
  const run = await supabaseAdmin.from("decision_observation_runs").select("id,task_id,task_version_id,payload").eq("user_id", userId).eq("id", runId).maybeSingle();
  if (run.error) throw new Error(run.error.message);
  if (!run.data || run.data.payload?.parserVersion !== "search-csv-v1" || run.data.payload.status !== "success") throw new Error("完整的搜索观察记录不可访问。");
  const c = run.data.payload.requestConditions;
  if (!c || !["trends_web", "ads_planner"].includes(c.provider) || typeof run.data.payload.rawSnapshot !== "string") throw new Error("搜索记录缺少原始导出。");
  const preview = parseSearchImport(c.provider, run.data.payload.rawSnapshot, { region: c.region, language: c.language, timeframe: c.timeframe });
  if (!preview.canConfirm) throw new Error("原始搜索记录尚不能作为提问依据。");
  const [task, version] = await Promise.all([
    supabaseAdmin.from("decision_observation_tasks").select("object_id").eq("user_id", userId).eq("id", run.data.task_id).maybeSingle(),
    supabaseAdmin.from("decision_observation_versions").select("config").eq("user_id", userId).eq("task_id", run.data.task_id).eq("id", run.data.task_version_id).maybeSingle(),
  ]);
  if (task.error || version.error) throw new Error(task.error?.message ?? version.error?.message);
  if (!task.data || !version.data) throw new Error("关联想法或配置不可访问。");
  if (c.region !== version.data.config.region || c.language !== version.data.config.language || c.timeframe !== version.data.config.timeRange) throw new Error("搜索记录口径与冻结的任务配置不一致，请重新核对原始导出。");
  const question = String(version.data.config.question).slice(0, 1000);
  const terms = [...new Set(preview.points.map(p => p.term))].slice(0, 12);
  return { runId, ideaId: task.data.object_id, title: `核对：${question}`.slice(0, 120), scenario: [
    `要核对的问题：${question}`, `搜索材料中的词组：${terms.join("、")}`, `采集口径：${c.region} / ${c.language} / ${c.timeframe}`,
    "这些是用户导入的平台材料，不代表痛点或付费意愿。请先了解对方最近一次实际任务，避免把搜索词直接当作客户原话。",
    "接触提纲：请还原最近一次相关情境；当时怎样处理、用了什么替代方案、仍有什么没解决？",
    `来源运行：${runId}`, `关联想法：/ideas/${task.data.object_id}`,
  ].join("\n\n") };
}
