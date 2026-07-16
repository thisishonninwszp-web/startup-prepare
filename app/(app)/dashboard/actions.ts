"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recommendNextAction } from "@/lib/ai";
import { daysSince } from "../ideas/types";
import { listRealityCases } from "../reality/queries";
import { listOpenOutsideViewChecks } from "../reasoning/queries";
import { listDueRetroPredictions, listOpenRetroCommitments } from "../retrospectives/queries";

export async function getRecommendation(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  const userId = user.id;

  const [
    realityCases,
    dueRetroPredictions,
    openCommitments,
    openChecks,
    validatingResult,
    duePredsResult,
  ] = await Promise.all([
    listRealityCases(userId),
    listDueRetroPredictions(userId),
    listOpenRetroCommitments(userId),
    listOpenOutsideViewChecks(userId),
    supabaseAdmin
      .from("ideas")
      .select("id, title, last_activity_at")
      .eq("user_id", userId)
      .eq("status", "验证中")
      .order("last_activity_at", { ascending: true }),
    supabaseAdmin
      .from("predictions")
      .select("id, text, due_at, idea_id, ideas!inner(title, user_id)")
      .eq("outcome", "pending")
      .lte("due_at", new Date().toISOString())
      .eq("ideas.user_id", userId)
      .order("due_at", { ascending: true }),
  ]);
  if (validatingResult.error) throw new Error(validatingResult.error.message);
  if (duePredsResult.error) throw new Error(duePredsResult.error.message);

  const dueRealityCases = realityCases.filter(
    (item) => item.review_due_at && new Date(item.review_due_at).getTime() <= Date.now()
  );

  const lines: string[] = [];

  const validating = validatingResult.data ?? [];
  if (validating.length > 0) {
    lines.push("=== 验证中的想法（越久没动越靠前）===");
    for (const idea of validating.slice(0, 10)) {
      lines.push(
        `- ${idea.title?.trim() || "（无标题）"}：${daysSince(idea.last_activity_at as string)} 天没有新的真实接触`
      );
    }
  }

  const duePreds = duePredsResult.data ?? [];
  if (duePreds.length > 0) {
    lines.push("", "=== 想法预测到期待对账 ===");
    for (const p of duePreds) lines.push(`- ${p.text}`);
  }

  if (dueRetroPredictions.length > 0) {
    lines.push("", "=== 周复盘预测到期待对账 ===");
    for (const p of dueRetroPredictions) lines.push(`- ${p.text}`);
  }

  if (dueRealityCases.length > 0) {
    lines.push("", "=== 现状地图待复查 ===");
    for (const c of dueRealityCases) lines.push(`- ${c.title}`);
  }

  if (openCommitments.length > 0) {
    lines.push("", "=== 复盘留下的未完成行动 ===");
    for (const c of openCommitments) lines.push(`- ${c.text}`);
  }

  if (openChecks.length > 0) {
    lines.push("", "=== 外部视角的未完成检验行动 ===");
    for (const c of openChecks) lines.push(`- ${c.check_text}`);
  }

  const contextText =
    lines.length > 0 ? lines.join("\n") : "当前没有任何待办信号，一切都是空的。";

  return recommendNextAction(contextText);
}
