"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { answerDrill, type DrillReveal } from "@/lib/domains/signals/backtest";

/** 交一道校准练习（或者说「我记得结果」），返回揭晓。 */
export async function answerDrillAction(
  questionId: string,
  input: { baseRate: number | null; probability: number | null; knew: boolean }
): Promise<{ ok: true; reveal: DrillReveal } | { ok: false; message: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("未登录");
    const reveal = await answerDrill(user.id, questionId, input);
    revalidatePath("/signals/calibrate");
    return { ok: true, reveal };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "没交上" };
  }
}
