"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTask } from "@/lib/domains/observations/queries";
import { saveRun } from "@/lib/domains/observations/commands";
import { buildSearchRun, type SearchPurpose } from "@/lib/domains/observations/search/run";
import type { SearchProvider } from "@/lib/domains/observations/search/imports";
import { loadSearchOutreachDraft } from "@/lib/domains/observations/search/outreach";

export async function saveSearchObservationRun(input: { taskId: string; taskVersionId: string; requestId: string; provider: SearchProvider; rawText: string; purpose?: SearchPurpose; termMappings?: Record<string, string> }) {
  if (process.env.DECISION_OBSERVATIONS_ENABLED !== "true") throw new Error("观察任务尚未启用。");
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error("请先登录。");
  const state = await getTask(user.id, input.taskId);
  if (state.status === "missing-schema") throw new Error("观察任务需要完成数据库更新。");
  if (!state.task) throw new Error("观察任务不可访问。");
  const version = state.versions.find((item) => item.id === input.taskVersionId);
  if (!version) throw new Error("观察配置版本不可访问。");
  const run = buildSearchRun(input.provider, input.rawText, { region: version.config.region, language: version.config.language, timeframe: version.config.timeRange }, { purpose: input.purpose, fixedPhrases: version.config.fixedPhrases, exploratoryPhrases: version.config.exploratoryPhrases, seeds: version.config.seeds, termMappings: input.termMappings });
  const result = await saveRun(user.id, { taskId: input.taskId, taskVersionId: input.taskVersionId, requestId: input.requestId, run });
  revalidatePath("/workbench"); revalidatePath(`/ideas/${state.task.object_id}`);
  return result;
}

export async function prepareSearchOutreachAction(runId: string) {
  if (process.env.DECISION_OBSERVATIONS_ENABLED !== "true") throw new Error("观察任务尚未启用。");
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error("请先登录。");
  return loadSearchOutreachDraft(user.id, runId);
}
