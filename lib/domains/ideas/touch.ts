import { supabaseAdmin } from "@/lib/supabase";
import { gapIdeaTitle, type GapSide } from "@/lib/domains/signals/gaps-shared";

/**
 * 强制出口机制按"最近活动"算 3 天。除了记一次真实对话，间接碰到现实也算（经用户同意，2026-10-20）：
 * 信息缺口标了「拿到了」且补进过信息、假门有人留了邮箱、记了一条读者回应。读 AI 分析、读新闻不算。
 * 验证记录（有痛 / 愿付钱）仍然只记真实对话 —— 这里只刷新时间，不写验证记录。
 */
export async function touchIdea(userId: string, ideaId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ideas")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", ideaId)
    .eq("user_id", userId);
  if (error) console.error("touch idea failed", error.message);
}

/** 差距清单的一条变成的想法（按标题认），刷新它的"最近活动"。没有变成想法就什么都不做。 */
export async function touchIdeaForGap(userId: string, headline: string, side: GapSide): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id")
    .eq("user_id", userId)
    .eq("title", gapIdeaTitle(headline, side))
    .neq("status", "归档");
  if (error) {
    console.error("touch idea for gap failed", error.message);
    return;
  }
  await Promise.all((data ?? []).map((r) => touchIdea(userId, r.id as string)));
}
