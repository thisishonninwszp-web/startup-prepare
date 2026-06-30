"use server";

import { createClient } from "@/lib/supabase/server";
import { getLifeCompassData } from "./queries";
import { analyzeLifeAlignment } from "@/lib/ai";
import type { AlignmentObservation } from "@/lib/ai";

export type { AlignmentObservation };

export async function runAlignmentAnalysis(): Promise<AlignmentObservation[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const data = await getLifeCompassData(user.id);
  return analyzeLifeAlignment(data);
}
