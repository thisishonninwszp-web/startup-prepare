"use server";

import { createClient } from "@/lib/supabase/server";
import { generateCognitivePatterns, type CognitivePattern } from "@/lib/ai";
import { getPatternsSnapshot } from "./queries";

export async function runPatternAnalysis(): Promise<CognitivePattern[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const snapshot = await getPatternsSnapshot(user.id);
  if (!snapshot.has_enough_data) {
    throw new Error("数据不足——至少需要 3 个想法或 5 条验证记录");
  }

  return generateCognitivePatterns(snapshot);
}
