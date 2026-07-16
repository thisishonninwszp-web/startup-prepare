import { supabaseAdmin } from "@/lib/supabase";

/**
 * 本周镜子：dashboard 第一行的"系统对准主人"信号。
 * 真实接触/工具内操作的口径与认知镜的存活日历完全一致
 * （真实接触 = validations + customer_conclusions；工具内操作 = observations + ai_sessions），
 * 不要在这里另造第二套定义。
 */
export type WeeklyMirror = {
  realContacts: number;
  toolOps: number;
  /** 材料箱里等待朱批的件数（status = reviewed）。 */
  pendingReview: number;
};

export async function getWeeklyMirror(userId: string): Promise<WeeklyMirror> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    validationsResult,
    conclusionsResult,
    observationsResult,
    aiSessionsResult,
    pendingReviewResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("validations")
      .select("id, ideas!inner(user_id)", { count: "exact", head: true })
      .eq("ideas.user_id", userId)
      .gte("contacted_at", since),
    supabaseAdmin
      .from("customer_conclusions")
      .select(
        "id, customer_proxy_versions!inner(customer_cases!inner(user_id))",
        { count: "exact", head: true }
      )
      .eq("customer_proxy_versions.customer_cases.user_id", userId)
      .gte("created_at", since),
    supabaseAdmin
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since),
    supabaseAdmin
      .from("ai_sessions")
      .select("id, ideas!inner(user_id)", { count: "exact", head: true })
      .eq("ideas.user_id", userId)
      .gte("created_at", since),
    supabaseAdmin
      .from("reality_materials")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "reviewed"),
  ]);

  // 材料箱迁移可能尚未执行（软依赖），查询失败按 0 处理但记录日志。
  let pendingReview = 0;
  if (pendingReviewResult.error) {
    console.error("读取待朱批件数失败", pendingReviewResult.error.message);
  } else {
    pendingReview = pendingReviewResult.count ?? 0;
  }

  for (const [label, result] of [
    ["真实验证", validationsResult],
    ["顾客结论", conclusionsResult],
    ["观察记录", observationsResult],
    ["AI 会话", aiSessionsResult],
  ] as const) {
    if (result.error) {
      console.error(`本周镜子读取${label}失败`, result.error.message);
    }
  }

  const realContacts =
    (validationsResult.count ?? 0) + (conclusionsResult.count ?? 0);
  const toolOps =
    (observationsResult.count ?? 0) + (aiSessionsResult.count ?? 0);

  return { realContacts, toolOps, pendingReview };
}
